import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as pause } from 'node:timers/promises';
import { Avalon, type ClientMessage, type RoomPlayer, type ServerMessage } from '@tabletop/shared';
import { botModelDirectory, decodeAvalonBotReply, makeBotContext, modelFor } from './avalon-bot';
import type { Connection, RoomManager } from './rooms';

const roster: RoomPlayer[] = ['m', 'p', 's', 'g', 'a'].map((id, seatIndex) => ({
  id, seatIndex, name: id, isBot: true, connected: true,
}));
const rng = () => 0;

function fixtures() {
  return {
    ...Avalon.avalon.setup(roster.map(({ id }) => id), { ...Avalon.defaultOptions(), morgana: true, percival: true }, rng),
    roles: { m: 'merlin', p: 'percival', s: 'servant', g: 'morgana', a: 'assassin' } as Record<string, Avalon.Role>,
  };
}

test('agents receive only their legal identity clues and decoder rejects illegal actions', () => {
  const state = fixtures();
  const assassin = Avalon.avalon.view(state, 'a');
  const merlin = Avalon.avalon.view(state, 'm');
  const memory = { actions: [], note: '' };
  const context = makeBotContext(assassin, roster, memory, { type: 'assassinate', target: 'm' });
  assert.deepEqual(context.self.sightings, [{ seat: 4, knownRole: '莫甘娜', clue: '确认邪恶' }]);
  assert.equal('roles' in context.self, false);
  assert.equal(decodeAvalonBotReply('{"target":4}', assassin, roster, { type: 'assassinate', target: 'm' }), null);
  assert.equal(decodeAvalonBotReply('{"success":false}', merlin, roster, { type: 'quest', success: true }), null);
  assert.equal(decodeAvalonBotReply('{"team":[1,1]}', merlin, roster, { type: 'draft_team', team: ['m', 'p'] }), null);
  const flip = decodeAvalonBotReply('{"target":1}', assassin, roster, { type: 'assassinate', target: 'm' });
  assert.deepEqual(flip?.action, { type: 'assassinate', target: 'm' });
});

test('role defaults and seat overrides pick independent server-side profiles', () => {
  const directory = botModelDirectory({
    DEEPSEEK_API_KEY: 'test-deepseek',
    AVALON_BOT_MODELS: '[{"id":"alt","label":"Alt","model":"alternate","baseUrl":"https://example.invalid/v1","apiKeyEnv":"ALT"}]',
    AVALON_BOT_API_KEYS: '{"ALT":"test-alt"}',
    AVALON_BOT_ROLE_MODELS: '{"assassin":"alt"}',
  });
  assert.equal(modelFor(directory, 'merlin')?.id, 'deepseek');
  assert.equal(modelFor(directory, 'assassin')?.id, 'alt');
  assert.equal(modelFor(directory, 'assassin', 'deepseek')?.id, 'deepseek');
  assert.equal(modelFor(directory, 'merlin', 'local'), undefined);
});

test('a room runs an entire discussion with independently routed bots and one human', async (t) => {
  const env = {
    BOT_PACE: '0.015', DEEPSEEK_API_KEY: 'test-deepseek',
    DEEPSEEK_BASE_URL: 'https://default.invalid', DEEPSEEK_MODEL: 'deepseek-flash',
    AVALON_BOT_MODELS: '[{"id":"alt","label":"Alt","model":"alternate","baseUrl":"https://alternate.invalid/v1"}]',
    AVALON_BOT_ROLE_MODELS: '{}',
  };
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  const requests: { seat: number; model: string; prompt: string; memory: { note: string } }[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    const context = JSON.parse(body.messages[1].content);
    const seat = context.self.seat as number;
    requests.push({ seat, model: body.model, prompt: body.messages[0].content, memory: context.memory });
    const action = context.instruction.action;
    const answer = action === 'text_speech' ? { speech: `第 ${seat} 号想先对这队的票。` } :
      action === 'vote' ? { approve: true } : { team: [1, 2] };
    return Response.json({ choices: [{ message: { content: JSON.stringify({ ...answer, memory: `seat-${seat}` }) } }] });
  });
  try {
    const { RoomManager } = await import('./rooms');
    const rooms: RoomManager = new RoomManager();
    let snapshot: Extract<ServerMessage, { type: 'room' }>['room'] | undefined;
    const errors: string[] = [];
    const conn: Connection = {
      clientId: null,
      send(message) {
        if (message.type === 'room') snapshot = message.room;
        if (message.type === 'error') errors.push(message.message);
      },
    };
    const send = (msg: ClientMessage) => rooms.handle(conn, msg);
    const act = (action: Avalon.AvalonAction) => send({ type: 'game_action', action });
    send({ type: 'hello', clientId: 'mock-avalon-seat-one' });
    send({ type: 'create_room', name: '测试信号', gameId: 'avalon' });
    send({ type: 'set_options', options: { botDifficulty: 'advanced' } });
    for (let i = 0; i < 4; i++) send({ type: 'add_bot' });
    const seatTwo = snapshot!.players[1];
    send({ type: 'set_avalon_bot_model', playerId: seatTwo.id, profile: 'alt' });
    send({ type: 'start_game' });
    act({ type: 'confirm_role' });

    const acted = new Set<string>();
    for (let i = 0; i < 240; i++) {
      const room = snapshot!;
      const view = room.view as Avalon.AvalonView;
      if (view.phase === 'vote' && view.voted.length === 4) break;
      if (view.phase === 'team' && view.leader === room.you) {
        const key = view.discussionComplete ? 'after' : 'before';
        if (!acted.has(key)) {
          acted.add(key);
          if (view.discussionComplete) act({ type: 'propose_team', team: room.players.slice(0, 2).map(({ id }) => id) });
          else act({ type: 'start_discussion', preselectedTeam: false, leaderFirst: true, direction: 'left' });
        }
      }
      if (view.phase === 'discussion' && view.discussion?.currentSpeaker === room.you && !acted.has(view.discussion.turn)) {
        acted.add(view.discussion.turn);
        act({ type: 'submit_speech', turn: view.discussion.turn, text: '这队先留一轮票，后面再换。' });
      }
      await pause(10);
    }
    const view = snapshot!.view as Avalon.AvalonView;
    assert.deepEqual(errors, []);
    assert.equal(view.speechMode, 'text');
    assert.equal(view.phase, 'vote');
    assert.equal(view.speeches.filter((speech) => speech.result === 'spoken').length, 5);
    assert.equal(view.voted.length, 4);
    for (const call of requests) {
      assert.equal(call.model, call.seat === 2 ? 'alternate' : 'deepseek-flash');
      if (call.memory.note) assert.equal(call.memory.note, `seat-${call.seat}`);
      assert.match(call.prompt, /只能使用本请求的视角/);
    }
    assert.ok(requests.some(({ seat }) => seat === 2));
    assert.ok(requests.some(({ memory }) => memory.note));
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
