import { Avalon } from '@tabletop/shared';
import { ResponsiveSheet } from '../../ui/ResponsiveSheet';

/** 任务记录：每次组队是谁提的、谁投了什么、任务结果如何。推理全靠它。 */
export function History({
  view,
  nameOf,
  onClose,
}: {
  view: Avalon.AvalonView;
  nameOf: (id: string) => string;
  onClose: () => void;
}) {
  const rounds = view.questSizes
    .map((_, q) => ({
      q,
      proposals: view.proposals.filter((p) => p.questIndex === q),
      quest: view.quests.find((r) => r.questIndex === q),
    }))
    .filter((r) => r.proposals.length > 0);

  return (
    <ResponsiveSheet label="任务记录" onClose={onClose}>
      <header className="drawer-head">
        <h2>任务记录</h2>
        <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>
          关闭
        </button>
      </header>
      {rounds.length === 0 && <p className="drawer-empty">组队和任务结果会显示在这里。</p>}
      {rounds.map(({ q, proposals, quest }) => (
        <section key={q} className="history-round">
          <h3>
            第 {q + 1} 次任务
            {quest && (
              <span className={`history-result tone-${quest.success ? 'good' : 'evil'}`}>
                {quest.success ? '成功' : '失败'}
                {quest.fails > 0 && `，${quest.fails} 张失败牌`}
              </span>
            )}
          </h3>
          {proposals.map((p) => {
            const yes = p.votes && view.players.filter((id) => p.votes?.[id] === true);
            const no = p.votes && view.players.filter((id) => p.votes?.[id] === false);
            return (
              <div key={p.attempt} className={`history-proposal ${p.approved ? 'is-approved' : 'is-rejected'}`}>
                <p className="history-line">
                  <strong>{nameOf(p.leader)}</strong> 提议 {p.team.map(nameOf).join('、')}
                  <span className="history-verdict">{p.forced ? '强制发车' : p.approved ? '通过' : '否决'}</span>
                </p>
                {!p.forced && (
                  <>
                    <p className="history-votes">
                      <span className="vote-dot vote-dot-yes" />
                      赞成 {p.approvals}{yes && ` · ${yes.map(nameOf).join('、') || '无'}`}
                    </p>
                    <p className="history-votes">
                      <span className="vote-dot vote-dot-no" />
                      反对 {p.rejections}{no && ` · ${no.map(nameOf).join('、') || '无'}`}
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </section>
      ))}
      {(view.lady?.inspections.length ?? 0) > 0 && (
        <section className="history-round">
          <h3>湖中仙女</h3>
          {view.lady!.inspections.map((i) => (
            <p key={i.target} className="history-line">
              第 {i.afterQuest + 1} 次任务后，<strong>{nameOf(i.by)}</strong> 查验了 {nameOf(i.target)}
              {view.me?.ladyResults[i.target] && (
                <span className={`history-result tone-${view.me.ladyResults[i.target]}`}>
                  {view.me.ladyResults[i.target] === 'good' ? '正义方' : '邪恶方'}（仅你可见）
                </span>
              )}
            </p>
          ))}
        </section>
      )}
    </ResponsiveSheet>
  );
}
