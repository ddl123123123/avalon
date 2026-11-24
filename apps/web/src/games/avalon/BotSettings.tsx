import { Avalon, type RoomSnapshot } from '@tabletop/shared';
import { net } from '../../net/client';

export function AvalonBotSettings({ room }: { room: RoomSnapshot }) {
  const bots = room.players.filter((player) => player.isBot);
  if (!bots.length) return null;
  const options = room.options as Avalon.AvalonOptions;
  const models = room.avalonModels;
  return (
    <fieldset className="av-bot-settings">
      <legend>机器人对战</legend>
      <p>有人机的对局使用文字发言，全桌都能查看发言记录。</p>
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
          {!models.profiles.length && <p>服务器暂无可用的外部模型。机器人使用本地规则行动，自己的发言轮次会跳过。</p>}
          {bots.map((bot) => (
            <label key={bot.id} className="field">
              {bot.seatIndex + 1} 号 · {bot.name}
              <select className="input" value={models.seats[bot.id] ?? ''}
                onChange={(e) => net.setAvalonBotModel(bot.id, e.currentTarget.value || null)}>
                <option value="">跟随服务器默认模型</option>
                <option value="local">本地规则</option>
                {models.profiles.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
          ))}
        </>
      ) : <p>本局难度：{options.botDifficulty === 'advanced' ? '高阶博弈' : '常规'}。</p>}
    </fieldset>
  );
}
