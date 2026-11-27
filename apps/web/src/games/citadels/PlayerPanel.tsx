import { AnimatePresence, motion } from 'framer-motion';
import { Citadels, type RoomPlayer } from '@tabletop/shared';
import { Crest } from '../../art/Crest';
import { Crown } from '../../art/glass';
import { Coin, DistrictCard, HandIcon } from './art';

const { CHARACTER } = Citadels;

/** 一名玩家的城市：金币、手牌数、已亮明的角色，以及建成的城区。 */
export function PlayerPanel({
  player,
  view,
  isMe,
  mine,
  onPickPlayer,
  pickedPlayer = false,
  costOf,
  pickedCard,
  onCard,
}: {
  player: RoomPlayer;
  view: Citadels.CitadelsView;
  isMe: boolean;
  /** 自己这一轮的全部角色：还没亮明的也要让自己看得到 */
  mine?: Citadels.CharacterId[];
  /** 魔术师挑选交换对象 */
  onPickPlayer?: () => void;
  pickedPlayer?: boolean;
  /** 军阀挑选目标时：返回摧毁花费，null 表示不能摧毁 */
  costOf?: (card: string) => number | null;
  pickedCard?: string | null;
  /** 点一座城区：平时是查看详情，军阀选目标时是选中 */
  onCard: (card: string) => void;
}) {
  const seat = view.seats[player.id]!;
  const active = view.turn?.player === player.id;
  const drafting = view.draft?.picker === player.id;
  const done = view.completed.includes(player.id);
  const empty = Math.max(0, view.citySize - seat.city.length);
  const classes = [
    'city-panel',
    isMe && 'is-me',
    (active || drafting) && 'is-active',
    !player.connected && 'is-offline',
    onPickPlayer && 'is-pickable',
    pickedPlayer && 'is-picked',
  ]
    .filter(Boolean)
    .join(' ');

  const head = (
    <>
      <span className="city-crest">
        <Crest seed={player.id} />
        {view.crown === player.id && (
          <motion.span className="city-crown" layoutId="citadels-crown" transition={{ type: 'spring', stiffness: 200, damping: 22 }}>
            <Crown />
          </motion.span>
        )}
      </span>
      <span className="city-who">
        <span className="city-name">
          {player.name}
          {isMe && <span className="seat-you">你</span>}
        </span>
        <span className="city-chars">
          {seat.revealed.map((c) => (
            <span key={c} className={`char-chip ${view.turn?.character === c && active ? 'is-acting' : ''}`}>
              <b>{CHARACTER[c].rank}</b>
              {CHARACTER[c].name}
            </span>
          ))}
          {mine
            ? mine
                .filter((c) => !seat.revealed.includes(c))
                .map((c) => (
                  <span key={c} className="char-chip is-secret" title="还没亮明，只有你看得到">
                    <b>{CHARACTER[c].rank}</b>
                    {CHARACTER[c].name}
                  </span>
                ))
            : Array.from({ length: seat.hidden }, (_, i) => (
                <span key={`h${i}`} className="char-chip is-hidden" title="还没亮明的角色">
                  ？
                </span>
              ))}
          {!player.connected && <span className="char-chip is-hidden">掉线</span>}
        </span>
      </span>
      <span className="city-stats">
        <span className="stat city-count" title={`已建成 ${seat.city.length} 座，建满 ${view.citySize} 座触发终局`}>
          <b>{seat.city.length}</b>
          <small>/{view.citySize}</small>
        </span>
        <span className="stat" title="金币">
          <Coin />
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.b key={seat.gold} initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }}>
              {seat.gold}
            </motion.b>
          </AnimatePresence>
        </span>
        <span className="stat" title="手牌">
          <HandIcon className="stat-icon" />
          <b>{seat.handCount}</b>
        </span>
      </span>
    </>
  );

  return (
    <section className={classes} data-built={seat.city.length} aria-label={`${player.name} 的城市`}>
      {onPickPlayer ? (
        <button type="button" className="city-head" aria-pressed={pickedPlayer} onClick={onPickPlayer}>
          {head}
        </button>
      ) : (
        <div className="city-head">{head}</div>
      )}
      <div className="city-row">
        <AnimatePresence initial={false}>
          {seat.city.map((card) => {
            const cost = costOf ? costOf(card) : undefined;
            const targetable = typeof cost === 'number';
            return (
              <motion.button
                key={card}
                type="button"
                className={`tile ${costOf ? (targetable ? 'is-target' : 'is-safe') : ''} ${pickedCard === card ? 'is-picked' : ''}`}
                onClick={() => onCard(card)}
                disabled={costOf !== undefined && !targetable}
                title={Citadels.districtOf(card).name}
                layout
                initial={{ opacity: 0, y: -40, scale: 1.6, rotate: -10 }}
                animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.2, rotate: 40, filter: 'brightness(3) saturate(0)' }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              >
                <DistrictCard card={card} compact />
                {targetable && <span className="tile-cost">{cost}</span>}
              </motion.button>
            );
          })}
        </AnimatePresence>
        {Array.from({ length: empty }, (_, i) => (
          <span key={`e${i}`} className="tile tile-empty" aria-hidden="true" />
        ))}
      </div>
      {done && <span className="city-done">{view.completed[0] === player.id ? '率先建成' : '已建成'}</span>}
    </section>
  );
}
