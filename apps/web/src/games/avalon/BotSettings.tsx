import { useState } from 'react';
import { Avalon, type RoomSnapshot } from '@tabletop/shared';
import { net } from '../../net/client';
import { SeatIdentity } from './SeatIdentity';

function ModelOptions({ profiles }: { profiles: NonNullable<RoomSnapshot['avalonModels']>['profiles'] }) {
  return <>
    <option value="">跟随服务器默认模型</option>
    <option value="local">本地规则</option>
    {profiles.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
  </>;
}

function BotModels({ models, bots }: {
  models: NonNullable<RoomSnapshot['avalonModels']>;
  bots: RoomSnapshot['players'];
}) {
  const [bulk, setBulk] = useState(models.defaultForNewBots ?? '');
  const applied = bulk === (models.defaultForNewBots ?? '') && bots.every((bot) => (models.seats[bot.id] ?? '') === bulk);
  return <>
    <div className="av-model-bulk">
      <label className="field">
        统一模型
        <select className="input" value={bulk} onChange={(event) => setBulk(event.currentTarget.value)}>
          <ModelOptions profiles={models.profiles} />
        </select>
      </label>
      <button type="button" className="btn btn-ghost btn-small" disabled={applied} onClick={() => net.setAvalonBotModels(bulk || null)}>
        应用到全部机器人
      </button>
    </div>
    <div className="av-model-individual" role="group" aria-label="单独调整机器人模型">
      {bots.map((bot) => (
        <label key={bot.id} className="field">
          <SeatIdentity player={bot} />
          <select className="input" value={models.seats[bot.id] ?? ''}
            onChange={(event) => net.setAvalonBotModel(bot.id, event.currentTarget.value || null)}>
            <ModelOptions profiles={models.profiles} />
          </select>
        </label>
      ))}
    </div>
  </>;
}

export function AvalonBotSettings({ room }: { room: RoomSnapshot }) {
  const bots = room.players.filter((player) => player.isBot);
  if (!bots.length) return null;
  const options = room.options as Avalon.AvalonOptions;
  const models = room.avalonModels;
  return (
    <fieldset className="av-bot-settings">
      <legend>机器人对战</legend>
      <p>外部模型会读取公开发言、战报和该机器人自己的身份视野。</p>
      {models ? (
        <>
          <div className="av-timer-options" role="group" aria-label="机器人难度">
            {(['standard', 'advanced'] as const).map((difficulty) => (
              <button key={difficulty} type="button" className="av-timer-choice"
                aria-pressed={options.botDifficulty === difficulty}
                onClick={() => net.setOptions({ botDifficulty: difficulty })}>
                {difficulty === 'standard' ? '常规' : '高阶博弈'}
              </button>
            ))}
          </div>
          {!models.profiles.length && <p>服务器暂无可用的外部模型。机器人按本地规则行动，并根据公开局势发言。</p>}
          <BotModels key={room.code} models={models} bots={bots} />
        </>
      ) : <p>本局难度：{options.botDifficulty === 'advanced' ? '高阶博弈' : '常规'}。</p>}
    </fieldset>
  );
}
