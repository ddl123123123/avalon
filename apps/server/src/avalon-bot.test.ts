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
  const state = { ...fixtures(), phase: 'assassin' as const };
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

test('Morgana sabotages the decisive third mission even when her model suggests success', () => {
  const state = {
    ...fixtures(), phase: 'quest' as const, questIndex: 2, team: ['m', 'g'],
    quests: [0, 1].map((questIndex) => ({
      questIndex, leader: 's', team: ['s', 'a'], fails: 1, success: false,
    })),
  };
  const decision = Avalon.avalon.botAction!(state, 'g', () => 0);
  assert.deepEqual(decision, { type: 'quest', success: false });
  const view = Avalon.avalon.view(state, 'g');
  const reply = decodeAvalonBotReply('{"success":true}', view, roster, { type: 'quest', success: false });
  assert.deepEqual(reply?.action, { type: 'quest', success: false });
  const afterMerlin = Avalon.avalon.reduce(state, 'm', { type: 'quest', success: true }, rng);
  const ended = Avalon.avalon.reduce(afterMerlin, 'g', reply!.action, rng);
  assert.equal(ended.winner, 'evil');
  assert.equal(ended.winReason, 'quests_failed');
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
  const drafts: unknown[] = [];
  const polished = '我先看这支队伍的投票，下一轮再考虑换人。';
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    const context = JSON.parse(body.messages[1].content);
    if ('draft' in context) {
      drafts.push(context);
      return Response.json({ choices: [{ message: { content: polished } }] });
    }
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
    let preview: Extract<ServerMessage, { type: 'avalon_assistant_result' }> | undefined;
    const errors: string[] = [];
    const botSpeechDurations: number[] = [];
    const conn: Connection = {
      identity: null,
      account: null,
      send(message) {
        if (message.type === 'room') {
          const previous = snapshot?.view as Avalon.AvalonView | undefined;
          const current = message.room.view as Avalon.AvalonView | null;
          if (previous?.discussion && current && current.speeches.length > previous.speeches.length) {
            const { deadline, timerSeconds, currentSpeaker } = previous.discussion;
            if (currentSpeaker !== message.room.you) botSpeechDurations.push(Date.now() - (deadline - timerSeconds * 1000));
          }
          snapshot = message.room;
        }
        if (message.type === 'error') errors.push(message.message);
        if (message.type === 'avalon_assistant_result') preview = message;
      },
    };
    const send = (msg: ClientMessage) => rooms.handle(conn, msg);
    const act = (action: Avalon.AvalonAction) => send({ type: 'game_action', action });
    send({ type: 'hello', clientId: 'mock-avalon-seat-one' });
    send({ type: 'create_room', name: '测试信号', gameId: 'avalon' });
    send({ type: 'set_options', options: { botDifficulty: 'advanced', discussionMode: 'manual' } });
    for (let i = 0; i < 3; i++) send({ type: 'add_bot' });
    send({ type: 'set_avalon_bot_models', profile: 'deepseek' });
    send({ type: 'add_bot' });
    assert.deepEqual(Object.values(snapshot!.avalonModels!.seats), Array(4).fill('deepseek'));
    assert.equal(snapshot!.avalonModels!.defaultForNewBots, 'deepseek');
    const seatTwo = snapshot!.players[1];
    send({ type: 'set_avalon_bot_model', playerId: seatTwo.id, profile: 'alt' });
    send({ type: 'start_game' });
    assert.equal((snapshot!.view as Avalon.AvalonView).speechMode, 'text');
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
        const original = '这队先留一轮票，后面再换。';
        send({ type: 'avalon_assistant', feature: 'speech-polish', requestId: 'test-polish',
          draft: { gameSeq: room.gameSeq, turn: view.discussion.turn, text: original } });
        for (let attempt = 0; !preview && attempt < 50; attempt++) await pause(10);
        assert.deepEqual(drafts, [{ draft: original }]);
        assert.deepEqual(preview, { type: 'avalon_assistant_result', requestId: 'test-polish', content: polished });
        assert.equal((snapshot!.view as Avalon.AvalonView).speeches.length, view.speeches.length);
        act({ type: 'submit_speech', turn: view.discussion.turn, text: polished });
      }
      await pause(10);
    }
    const view = snapshot!.view as Avalon.AvalonView;
    assert.deepEqual(errors, []);
    assert.equal(view.speechMode, 'text');
    assert.equal(view.phase, 'vote');
    assert.equal(view.speeches.filter((speech) => speech.result === 'spoken').length, 5);
    assert.equal(view.speeches.find((speech) => speech.player === snapshot!.you)?.text, polished);
    assert.equal(view.voted.length, 4);
    assert.equal(botSpeechDurations.length, 4);
    assert.ok(botSpeechDurations.every((ms) => ms >= 140), 'BOT_PACE scales the ten-second speech interval');
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

test('one local bot is enough to enable and participate in text discussion', async () => {
  const { RoomManager } = await import('./rooms');
  const rooms = new RoomManager();
  const snapshots = new Map<Connection, Extract<ServerMessage, { type: 'room' }>['room']>();
  const humans = Array.from({ length: 4 }, (_, index) => {
    const conn: Connection = {
      identity: null, account: null,
      send(message) {
        if (message.type === 'room') snapshots.set(conn, message.room);
        if (message.type === 'error') assert.fail(message.message);
      },
    };
    rooms.handle(conn, { type: 'hello', clientId: `single-bot-test-player-${index}` });
    return conn;
  });
  const host = humans[0]!;
  rooms.handle(host, { type: 'create_room', name: '房主', gameId: 'avalon' });
  const code = snapshots.get(host)!.code;
  for (const [index, conn] of humans.slice(1).entries()) {
    rooms.handle(conn, { type: 'join_room', code, name: `玩家 ${index + 2}` });
  }
  rooms.handle(host, { type: 'set_options', options: { discussionMode: 'manual', speechSeconds: 0 } });
  rooms.handle(host, { type: 'add_bot' });
  rooms.handle(host, { type: 'set_avalon_bot_models', profile: 'local' });
  rooms.handle(host, { type: 'start_game' });
  const act = (conn: Connection, action: Avalon.AvalonAction) => rooms.handle(conn, { type: 'game_action', action });
  for (const conn of humans) act(conn, { type: 'confirm_role' });

  const bot = snapshots.get(host)!.players.find((player) => player.isBot)!;
  let botText: string | undefined;
  for (let tries = 0; tries < 110; tries++) {
    const view = snapshots.get(host)!.view as Avalon.AvalonView;
    assert.equal(view.speechMode, 'text');
    botText = view.speeches.find((speech) => speech.player === bot.id && speech.result === 'spoken')?.text;
    if (botText) break;
    const activeId = view.discussion?.currentSpeaker ?? view.leader;
    const active = humans.find((conn) => snapshots.get(conn)!.you === activeId);
    if (active && view.phase === 'team' && !view.discussionComplete) {
      act(active, { type: 'start_discussion', preselectedTeam: false, leaderFirst: true, direction: 'left' });
    }
    if (active && view.discussion) {
      act(active, { type: 'submit_speech', turn: view.discussion.turn, text: '我先看这个队伍的理由。' });
    }
    await pause(10);
  }
  assert.ok(botText, 'the local bot also submits an actual text message');
});
