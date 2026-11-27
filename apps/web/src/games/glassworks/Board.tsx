import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Glassworks, type RoomPlayer, type RoomSnapshot } from '@tabletop/shared';
import { Crest } from '../../art/Crest';
import { Crown } from '../../art/glass';
import { SplitText } from '../../fx/SplitText';
import { net } from '../../net/client';
import { Ticker } from '../../ui/Ticker';
import { ResponsiveSheet } from '../../ui/ResponsiveSheet';
import { CommissionTile, Flame, GlassworksCardStyleContext, KilnMark, PanelBack, PanelCard, Shard, type GlassworksCardStyle } from './art';
import { describe, heatTarget, listPieces, scoreParts, toneOf } from './text';

type View = Glassworks.GlassworksView;
type Seat = Glassworks.GlassworksSeat;
type Piece = Glassworks.Piece;
type Tier = Glassworks.Tier;
const { HUES, PIECES, PIECE_NAMES, TIER_NAMES, TIERS, SKETCH_LIMIT, HAND_LIMIT, TAKE_LIMIT, panelOf, commissionOf } = Glassworks;

const NO_GLASS: Record<Piece, number> = { blue: 0, red: 0, green: 0, amber: 0, violet: 0, gold: 0 };

/** 选中了什么：画廊里的一张、某一档的牌堆顶，或自己的一张图稿 */
type Pick = { kind: 'gallery' | 'sketch'; id: string } | { kind: 'deck'; tier: Tier };

/** 联窗进度：这种炉色的小窗、花窗、玫瑰窗各有没有。三档齐了就是一组联窗 */
function TierPips({ tiers }: { tiers: [number, number, number] }) {
  const done = Math.min(...tiers) > 0;
  return (
    <span className={`tier-pips ${done ? 'is-done' : ''}`} aria-hidden="true">
      {tiers.map((n, i) => (
        <i key={i} className={n > 0 ? 'is-on' : ''} />
      ))}
    </span>
  );
}

/**
 * 一个人的料和炉色：每种颜色一列，上面是炉色（方章）和联窗进度，下面是手里的料。
 * 全部用行内元素，这样对手那一行可以整个做成按钮。
 */
function Palette({ seat, onPiece, chosen }: { seat: Seat; onPiece?: (piece: Piece) => void; chosen?: Piece[] }) {
  return (
    <span className="palette">
      {PIECES.map((piece) => {
        const kiln = piece === 'gold' ? 0 : seat.kilns[piece];
        const have = seat.glass[piece];
        const marked = chosen?.filter((p) => p === piece).length ?? 0;
        const cell = (
          <>
            <Shard piece={piece} />
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.b key={have} initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 8, opacity: 0 }}>
                {have}
              </motion.b>
            </AnimatePresence>
            {marked > 0 && <i className="palette-out">−{marked}</i>}
          </>
        );
        return (
          <span key={piece} className={`palette-col ${have === 0 && kiln === 0 ? 'is-empty' : ''}`} title={PIECE_NAMES[piece]}>
            <span className={`palette-kiln ${kiln === 0 ? 'is-zero' : ''}`}>
              {piece !== 'gold' && (
                <>
                  <KilnMark hue={piece} />
                  <b>{kiln}</b>
                </>
              )}
            </span>
            {piece !== 'gold' ? <TierPips tiers={seat.tiers[piece]} /> : <span className="tier-pips" aria-hidden="true" />}
            {onPiece ? (
              <button type="button" className={`palette-glass is-pickable ${have === 0 ? 'is-zero' : ''}`} disabled={have - marked <= 0} onClick={() => onPiece(piece)} aria-label={`放回一块${PIECE_NAMES[piece]}`}>
                {cell}
              </button>
            ) : (
              <span className={`palette-glass ${have === 0 ? 'is-zero' : ''}`}>{cell}</span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** 委托的紧凑写法（手机上用）：声望 + 要求的炉色，已经达到的打上标记 */
function CommissionChip({ commission, kilns }: { commission: string; kilns: Record<Glassworks.Hue, number> | null }) {
  const def = commissionOf(commission);
  const need = HUES.filter((h) => def.need[h]);
  return (
    <span className="gw-chip" title={`${def.name}的委托`}>
      <b className="gw-chip-points">{def.points}</b>
      {need.map((h) => (
        <span key={h} className={`gw-chip-need ${kilns && kilns[h] >= def.need[h]! ? 'is-met' : ''}`}>
          <KilnMark hue={h} />
          <b>{def.need[h]}</b>
        </span>
      ))}
    </span>
  );
}

/**
 * 一张窗片的账单：造价里的每种颜色，手里有几块 / 实际要付几块（已经扣掉炉色和余温）。
 * 炉色全包了的写「免」，手里不够的标出来。
 */
function Bill({ seat, panel }: { seat: Seat; panel: string }) {
  const def = panelOf(panel);
  const owed = Glassworks.owedFor(seat.glass, seat.kilns, panel, seat.heat);
  return (
    <span className="gw-bill">
      {HUES.filter((h) => def.cost[h]).map((h) => {
        const have = Math.min(seat.glass[h], owed[h]);
        const state = owed[h] === 0 ? 'is-free' : have < owed[h] ? 'is-short' : 'is-met';
        return (
          <span key={h} className={`gw-bill-item ${state}`} title={PIECE_NAMES[h]}>
            <Shard piece={h} />
            {owed[h] === 0 ? (
              <b>免</b>
            ) : (
              <b>
                {have}
                <i>/{owed[h]}</i>
              </b>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** 只差一两步的窗片标出来：还差几块料（金箔已经算进去）。差得远的不标，免得满屏都是数字 */
function ShortTag({ short }: { short: number }) {
  if (short <= 0 || short > 3) return null;
  return <span className="gw-short">差 {short}</span>;
}

/** 余温现在能给哪一档省料 */
function HeatTag({ heat, long = false }: { heat: Glassworks.Heat; long?: boolean }) {
  const target = heatTarget(heat);
  if (!target) return null;
  return (
    <span className="gw-hot" title={`上一回合烧的是${TIER_NAMES[heat as Tier]}：这一回合接着烧${TIER_NAMES[target.tier]}少付 ${target.saves} 块料`}>
      <Flame />
      {long ? `趁热烧${TIER_NAMES[target.tier]}少付 ${target.saves} 块` : `${TIER_NAMES[target.tier]} −${target.saves}`}
    </span>
  );
}

export function GlassworksBoard({ room }: { room: RoomSnapshot }) {
  const [cardStyle, setCardStyle] = useState<GlassworksCardStyle>(() => {
    try {
      return localStorage.getItem('glassworks.cardStyle') === 'starry-night' ? 'starry-night' : 'blue-gold';
    } catch {
      return 'blue-gold';
    }
  });
  const chooseCardStyle = (style: GlassworksCardStyle) => {
    setCardStyle(style);
    try {
      localStorage.setItem('glassworks.cardStyle', style);
    } catch {
      // 无法保存时当前对局仍可切换。
    }
  };
  return (
    <GlassworksCardStyleContext.Provider value={cardStyle}>
      <GlassworksMatch key={room.code} room={room} cardStyle={cardStyle} onCardStyleChange={chooseCardStyle} />
    </GlassworksCardStyleContext.Provider>
  );
}

function GlassworksMatch({ room, cardStyle, onCardStyleChange }: {
  room: RoomSnapshot;
  cardStyle: GlassworksCardStyle;
  onCardStyleChange: (style: GlassworksCardStyle) => void;
}) {
  const view = room.view as View;
  const byId = new Map(room.players.map((p) => [p.id, p]));
  const playerOf = (id: string): RoomPlayer => byId.get(id) ?? { id, name: '？', connected: false, isBot: false, seatIndex: -1 };
  const nameOf = (id: string) => playerOf(id).name;
  const act = (action: Glassworks.GlassworksAction) => net.act(action);
  const meId = view.me?.id ?? null;
  const mine = meId ? view.seats[meId]! : null;

  const [run, setRun] = useState<{ from: number; count: number } | null>(null);
  const [picked, setPick] = useState<Pick | null>(null);
  const [giveBack, setGiveBack] = useState<Piece[]>([]);
  const [showLog, setShowLog] = useState(false);
  /** 打开「各家作坊」时先看谁 */
  const [showSeats, setShowSeats] = useState<string | null>(null);

  // 局面一变，之前选中的东西可能已经不在原位了
  const rackKey = view.rackIds.join(',');
  useEffect(() => setRun(null), [rackKey, view.turn]);
  // 点中的窗片是「目标」：别人行动时也留着，直到它被烧掉或被人拿走。牌堆顶只在自己的回合里选
  useEffect(() => setPick((cur) => (cur?.kind === 'deck' ? null : cur)), [view.turn]);
  const pick: Pick | null =
    picked === null
      ? null
      : picked.kind === 'deck'
        ? picked
        : picked.kind === 'gallery'
          ? TIERS.some((t) => view.gallery[t].includes(picked.id))
            ? picked
            : null
          : mine?.sketches.some((s) => s.id === picked.id)
            ? picked
            : null;
  useEffect(() => setGiveBack([]), [view.mustDiscard, view.turn]);

  const latest = useRef(view);
  latest.current = view;
  // 点中窗片后行动区会变高，矮屏上可能正好把它盖住：等布局稳了把它滚回视野里
  const gallery = useRef<HTMLElement>(null);
  const targetKey = picked && picked.kind !== 'deck' ? picked.id : null;
  useEffect(() => {
    if (!targetKey) return;
    const timer = window.setTimeout(() => gallery.current?.querySelector('.gw-card.is-picked')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 120);
    return () => window.clearTimeout(timer);
  }, [targetKey]);
  // Esc 放下手里选的东西
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setRun(null);
      setPick(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (view.phase === 'ended') return <EndScreen room={room} view={view} />;

  const myTurn = meId !== null && view.turn === meId;
  const discarding = myTurn && view.mustDiscard > 0;
  const canAct = myTurn && !discarding;
  const myIndex = meId ? view.players.indexOf(meId) : -1;
  const rivals = view.players.map((_, i) => view.players[(myIndex + 1 + i) % view.players.length]!).filter((id) => id !== meId);
  const payable = (id: string) => (mine ? Glassworks.paymentFor(mine.glass, mine.kilns, id, mine.heat) : null);
  /** 烧这块还差几块料（金箔已经算进去）；0 就是付得起 */
  const gapOf = (id: string) => (mine ? Glassworks.missingFor(mine.glass, mine.kilns, id, mine.heat) : null);
  /** 趁余温烧这块能省几块料 */
  const heatSaving = (id: string) => {
    if (!mine?.heat) return 0;
    // 手里一块料都没有时的缺口，就是扣掉炉色后要付的总数
    return Glassworks.missingFor(NO_GLASS, mine.kilns, id, 0).total - Glassworks.missingFor(NO_GLASS, mine.kilns, id, mine.heat).total;
  };
  const warm = mine ? heatTarget(mine.heat) : null;
  /** 目标窗片：点中的那一张（画廊里的或自己的图稿） */
  const target = pick && pick.kind !== 'deck' ? pick.id : null;
  const targetGap = target ? gapOf(target) : null;
  /** 晾架上这种颜色是不是目标窗片还缺的 */
  const wanted = (hue: Glassworks.Hue) => (targetGap ? targetGap.byHue[hue] > 0 : false);

  // 按编号而不是按位置认料：正在退场的料还留在页面上几百毫秒，点到它时应当被忽略，
  // 而不是按旧位置选中另一块
  const onShard = (pieceId: number) => {
    const now = latest.current;
    const i = now.rackIds.indexOf(pieceId);
    if (i < 0 || now.turn !== meId || now.mustDiscard > 0) return;
    // 目标窗片留着，只把牌堆顶的选择放下
    setPick((cur) => (cur?.kind === 'deck' ? null : cur));
    setRun((r) => {
      if (!r) return { from: i, count: 1 };
      const end = r.from + r.count - 1;
      // 点相邻的料就把选区延伸过去；已经选满时整段跟着平移
      if (i === r.from - 1) return { from: i, count: Math.min(TAKE_LIMIT, r.count + 1) };
      if (i === end + 1) return r.count < TAKE_LIMIT ? { from: r.from, count: r.count + 1 } : { from: r.from + 1, count: r.count };
      if (i === r.from) return r.count > 1 ? { from: r.from + 1, count: r.count - 1 } : null;
      if (i === end) return { from: r.from, count: r.count - 1 };
      return { from: i, count: 1 };
    });
  };
  const choose = (next: Pick) => {
    setRun(null);
    setPick(JSON.stringify(pick) === JSON.stringify(next) ? null : next);
  };
  const isPicked = (next: Pick) => JSON.stringify(pick) === JSON.stringify(next);
  /** 画廊和图稿里的一张窗片：烧得起、还差几块、是不是目标 */
  const cardState = (id: string, kind: 'gallery' | 'sketch') => {
    const gap = gapOf(id);
    return { on: isPicked({ kind, id }), ready: gap !== null && payable(id) !== null, short: gap && payable(id) === null ? gap.total : 0 };
  };

  /* ---------- 行动区 ---------- */
  let prompt = '';
  let hint: ReactNode = null;
  let buttons: ReactNode = null;
  /** 行动区现在显示的是不是目标窗片的账单 */
  let showsTarget = false;

  /** 目标窗片：名字、账单、付得起还是差几块 */
  const showTarget = (id: string) => {
    const def = panelOf(id);
    prompt = `${PIECE_NAMES[def.hue]}${TIER_NAMES[def.tier]}${def.points ? `，声望 ${def.points}` : ''}`;
    showsTarget = true;
    if (!mine) {
      hint = `造价：${listPieces(def.cost)}`;
      return;
    }
    const pay = payable(id);
    const saved = heatSaving(id);
    const status = pay
      ? PIECES.every((p) => pay[p] === 0)
        ? '炉色已经够了，不用付料'
        : pay.gold > 0
          ? `付得起，用 ${pay.gold} 片金箔补缺`
          : '付得起'
      : `还差 ${gapOf(id)!.total} 块${mine.glass.gold > 0 ? '（金箔已经算上）' : ''}`;
    hint = (
      <>
        <Bill seat={mine} panel={id} />
        <span>
          {status}
          {saved > 0 ? `，余温省 ${saved} 块` : ''}
        </span>
      </>
    );
  };

  if (!mine) {
    prompt = '你正在旁观这一局';
    if (target) showTarget(target);
  } else if (discarding) {
    const left = view.mustDiscard - giveBack.length;
    prompt = `手里最多留 ${HAND_LIMIT} 块料，点选 ${view.mustDiscard} 块放回去`;
    hint = left > 0 ? `还要再选 ${left} 块` : `放回：${listPieces(Object.fromEntries(PIECES.map((p) => [p, giveBack.filter((x) => x === p).length])))}`;
    buttons = (
      <>
        <button type="button" className="btn btn-primary" disabled={left !== 0} onClick={() => act({ type: 'discard', pieces: giveBack })}>
          放回 {view.mustDiscard} 块
        </button>
        <button type="button" className="btn btn-ghost btn-small" disabled={giveBack.length === 0} onClick={() => setGiveBack([])}>
          重选
        </button>
      </>
    );
  } else if (canAct && run) {
    const pieces = view.rack.slice(run.from, run.from + run.count);
    prompt = `取走${pieces.map((h) => PIECE_NAMES[h]).join('、')}`;
    const over = PIECES.reduce((sum, p) => sum + mine.glass[p], 0) + run.count - HAND_LIMIT;
    // 这几块里有几块是目标窗片还缺的
    const need = { ...(targetGap?.byHue ?? {}) } as Partial<Record<Glassworks.Hue, number>>;
    const useful = pieces.filter((h) => (need[h] ?? 0) > 0 && need[h]!-- > 0).length;
    hint =
      over > 0
        ? `拿了就超过 ${HAND_LIMIT} 块，得放回 ${over} 块`
        : warm
          ? `取料之后炉子就凉了，${TIER_NAMES[warm.tier]}少付 ${warm.saves} 块的余温就没了`
          : target
            ? useful > 0
              ? `其中 ${useful} 块是你点中的那张窗片要的`
              : '这几块里没有你点中的那张窗片要的料'
            : run.count < TAKE_LIMIT
              ? `还可以再点旁边相邻的料，一次最多 ${TAKE_LIMIT} 块`
              : '已经选满三块';
    buttons = (
      <>
        <button type="button" className="btn btn-primary" onClick={() => act({ type: 'take', from: run.from, count: run.count })}>
          取走这 {run.count} 块
        </button>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => setRun(null)}>
          不取了
        </button>
      </>
    );
  } else if (canAct && pick?.kind === 'deck') {
    const full = mine.sketches.length >= SKETCH_LIMIT;
    prompt = `从${TIER_NAMES[pick.tier]}牌堆顶摸一张，收作图稿`;
    hint = full ? `手里已经有 ${SKETCH_LIMIT} 张图稿了，先烧掉一张` : `摸到什么只有你知道${view.gold > 0 ? '，并拿 1 片金箔' : '。金箔已经发完了'}`;
    buttons = (
      <button type="button" className="btn btn-primary" disabled={full} onClick={() => act({ type: 'sketch', tier: pick.tier, slot: -1 })}>
        摸一张图稿
      </button>
    );
  } else if (target && pick && pick.kind !== 'deck') {
    showTarget(target);
    if (canAct) {
      const def = panelOf(target);
      const pay = payable(target);
      const full = mine.sketches.length >= SKETCH_LIMIT;
      buttons = (
        <>
          <button type="button" className="btn btn-primary" disabled={!pay} onClick={() => act({ type: 'build', panel: target })}>
            {pay && heatSaving(target) > 0 ? '趁热烧制' : '烧制'}
          </button>
          {pick.kind === 'gallery' && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={full}
              onClick={() => {
                const slot = view.gallery[def.tier].indexOf(target);
                if (slot >= 0) act({ type: 'sketch', tier: def.tier, slot });
              }}
            >
              {full ? '图稿已满' : view.gold > 0 ? '描样，拿 1 片金箔' : '描样（金箔发完了）'}
            </button>
          )}
        </>
      );
    }
  } else if (!myTurn) {
    prompt = `${nameOf(view.turn)} 正在行动`;
    hint = view.finalRound ? '已经有人达到目标声望，这是最后一圈' : '可以先点一张窗片，看看还差哪些料';
  } else {
    prompt = '轮到你了。取料、描样、烧制，三选一';
    hint = warm
      ? `炉子还热着：这回合接着烧${TIER_NAMES[warm.tier]}少付 ${warm.saves} 块`
      : view.rack.length > 0
        ? '点晾架上相邻的料来取，或者点一张窗片看能不能烧'
        : '晾架空了。可以烧制、描样，实在没事可做就跳过';
    if (view.rack.length === 0) {
      buttons = (
        <button type="button" className="btn btn-ghost" onClick={() => act({ type: 'pass' })}>
          跳过这一回合
        </button>
      );
    }
  }

  return (
    <main className="board gw-board">
      <header className="room-bar gw-bar">
        <button type="button" className="link" onClick={net.leaveRoom}>
          离开
        </button>
        <div className="room-code">
          <span>房间号</span>
          <strong>{room.code}</strong>
        </div>
        <div className="room-bar-actions">
          <span className={`ct-round ${view.finalRound ? 'is-final' : ''}`}>
            {view.finalRound ? '最后一圈' : `第 ${view.round} 圈`}
            {!view.finalRound && <span className="gw-target">，先到 {view.target} 分</span>}
          </span>
          <select
            className="gw-card-style"
            aria-label="卡牌画风"
            value={cardStyle}
            onChange={(event) => onCardStyleChange(event.target.value === 'starry-night' ? 'starry-night' : 'blue-gold')}
          >
            <option value="blue-gold">蓝金徽章</option>
            <option value="starry-night">星夜典藏</option>
          </select>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setShowLog(true)}>
            记录
          </button>
        </div>
      </header>

      <div className="gw-rivals" data-count={rivals.length}>
        {/* 手机上对手排成一张表，这一行是表头 */}
        <span className="gw-rivals-head" aria-hidden="true">
          <span>炉色与手里的料</span>
          {HUES.map((hue) => (
            <KilnMark key={hue} hue={hue} />
          ))}
          {PIECES.map((piece) => (
            <Shard key={piece} piece={piece} />
          ))}
        </span>
        {rivals.map((id) => (
          <SeatStrip key={id} player={playerOf(id)} seat={view.seats[id]!} active={view.turn === id} first={view.startPlayer === id} onOpen={() => setShowSeats(id)} />
        ))}
      </div>

      <div className="gw-table">
        <section className="gw-commissions" aria-label="委托" style={{ '--n': Math.max(1, view.commissions.length) } as CSSProperties}>
          <AnimatePresence initial={false}>
            {view.commissions.map((id) => (
              <motion.div key={id} className="gw-commission" layout exit={{ opacity: 0, y: -30, scale: 0.8 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}>
                <CommissionTile commission={id} />
              </motion.div>
            ))}
          </AnimatePresence>
          {view.commissions.length === 0 && <p className="dock-hint">委托都被接走了</p>}
        </section>
        <section className="gw-chips" aria-label="委托">
          <span className="gw-chips-label">委托</span>
          {view.commissions.map((id) => (
            <CommissionChip key={id} commission={id} kilns={mine?.kilns ?? null} />
          ))}
          {view.commissions.length === 0 && <span className="gw-chips-label">都被接走了</span>}
        </section>

        <section className="gw-gallery" aria-label="画廊" ref={gallery}>
          {([3, 2, 1] as Tier[]).map((tier) => (
            <div key={tier} className={`gw-row ${warm?.tier === tier ? 'is-warm' : ''}`}>
              <button
                type="button"
                className={`gw-card gw-deck ${isPicked({ kind: 'deck', tier }) ? 'is-picked' : ''}`}
                disabled={!canAct || view.deckCounts[tier] === 0}
                onClick={() => choose({ kind: 'deck', tier })}
                aria-label={`${TIER_NAMES[tier]}牌堆，还有 ${view.deckCounts[tier]} 张`}
              >
                <PanelBack tier={tier} />
                <span className="gw-deck-count">{view.deckCounts[tier]}</span>
                {warm?.tier === tier && (
                  <span className="gw-row-heat">
                    <Flame />−{warm.saves}
                  </span>
                )}
              </button>
              {view.gallery[tier].map((id, slot) => {
                if (!id) return <span key={`empty-${slot}`} className="gw-card gw-card-empty" aria-hidden="true" />;
                const st = cardState(id, 'gallery');
                return (
                  <motion.button
                    key={id}
                    type="button"
                    className={`gw-card ${st.on ? 'is-picked' : ''} ${st.ready ? 'is-ready' : ''}`}
                    aria-pressed={st.on}
                    onClick={() => choose({ kind: 'gallery', id })}
                    initial={{ opacity: 0, rotateY: 90, scale: 0.9 }}
                    // 上浮交给动画库：它会写内联 transform，CSS 里的 transform 不起作用
                    // 只抬一点：抬高了会盖住上面那排窗片的造价
                    animate={{ opacity: 1, rotateY: 0, scale: st.on ? 1.04 : 1, y: st.on ? -3 : 0 }}
                    transition={{ type: 'spring', stiffness: 220, damping: 20 }}
                  >
                    <PanelCard panel={id} />
                    <ShortTag short={st.short} />
                  </motion.button>
                );
              })}
            </div>
          ))}
          {mine && mine.sketches.length > 0 && (
            <div className="gw-row gw-row-sketches" aria-label="你的图稿">
              <span className="gw-row-label">
                我的
                <br />
                图稿
              </span>
              {mine.sketches.map((sk) => {
                if (!sk.id) return null;
                const id = sk.id;
                const st = cardState(id, 'sketch');
                return (
                  <button key={id} type="button" className={`gw-card ${st.on ? 'is-picked' : ''} ${st.ready ? 'is-ready' : ''}`} aria-pressed={st.on} onClick={() => choose({ kind: 'sketch', id })}>
                    <PanelCard panel={id} />
                    <ShortTag short={st.short} />
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <div className="gw-me">
        <section className="gw-rack-area" aria-label="晾架">
          <div className={`gw-rack ${canAct ? 'is-open' : ''}`}>
            <AnimatePresence initial={false} mode="popLayout">
              {view.rack.map((hue, i) => {
                const selected = run !== null && i >= run.from && i < run.from + run.count;
                return (
                  <motion.button
                    key={view.rackIds[i]}
                    type="button"
                    layout
                    className={`gw-shard ${selected ? 'is-selected' : ''} ${wanted(hue) ? 'is-wanted' : ''}`}
                    disabled={!canAct}
                    aria-pressed={selected}
                    aria-label={`晾架第 ${i + 1} 块，${PIECE_NAMES[hue]}${wanted(hue) ? '，你点中的窗片还缺这种' : ''}`}
                    onClick={() => onShard(view.rackIds[i]!)}
                    initial={{ opacity: 0, x: 40, scale: 0.5 }}
                    animate={{ opacity: 1, x: 0, scale: 1, y: selected ? -8 : 0 }}
                    exit={{ opacity: 0, y: 40, scale: 0.4 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                  >
                    <Shard piece={hue} />
                  </motion.button>
                );
              })}
            </AnimatePresence>
            {view.rack.length === 0 && <p className="dock-hint">晾架空了</p>}
          </div>
          <p className="gw-bag">
            布袋里
            {HUES.map((hue) => (
              <span key={hue} className={view.bag[hue] === 0 ? 'is-zero' : ''} title={PIECE_NAMES[hue]}>
                <Shard piece={hue} />
                {view.bag[hue]}
              </span>
            ))}
            <span className={view.gold === 0 ? 'is-zero' : ''} title="供应里的金箔">
              <Shard piece="gold" />
              {view.gold}
            </span>
          </p>
        </section>
        <Ticker log={view.log} describe={(e) => describe(e, nameOf, view.target)} tone={toneOf} />
        {mine && meId && (
          <div className={`gw-mine ${myTurn ? 'is-active' : ''} ${warm ? 'is-hot' : ''}`}>
            <div className="gw-mine-head">
              <button type="button" className="gw-score gw-score-button" onClick={() => setShowSeats(meId)} aria-label={`你的声望 ${mine.score.total}，看各家作坊的明细`}>
                {mine.score.total}
                <small>声望</small>
                <HeatTag heat={mine.heat} />
              </button>
              <Palette seat={mine} onPiece={discarding ? (piece) => giveBack.length < view.mustDiscard && setGiveBack((g) => [...g, piece]) : undefined} chosen={giveBack} />
            </div>
            {mine.sketches.length > 0 && (
              <div className="gw-sketches" aria-label="你的图稿">
                <span className="gw-sketches-label">图稿</span>
                {mine.sketches.map((sk) => {
                  if (!sk.id) return null;
                  const id = sk.id;
                  const st = cardState(id, 'sketch');
                  return (
                    <button key={id} type="button" className={`gw-card gw-sketch ${st.on ? 'is-picked' : ''} ${st.ready ? 'is-ready' : ''}`} aria-pressed={st.on} onClick={() => choose({ kind: 'sketch', id })}>
                      <PanelCard panel={id} />
                      <ShortTag short={st.short} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <div className={`ct-actions ${myTurn ? 'is-mine' : ''} ${target ? 'has-target' : ''} ${showsTarget ? 'shows-target' : ''}`}>
          <div className="ct-actions-text">
            <p className="dock-prompt" aria-live="polite">
              {prompt}
            </p>
            {hint && <p className="dock-hint">{hint}</p>}
          </div>
          {buttons && <div className="ct-buttons">{buttons}</div>}
          {target && !buttons && (
            <div className="ct-buttons">
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setPick(null)}>
                放下这张
              </button>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showLog && (
          <ResponsiveSheet key="log" label="对局记录" onClose={() => setShowLog(false)}>
            <header className="drawer-head">
              <h2>对局记录</h2>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setShowLog(false)}>
                关闭
              </button>
            </header>
            <p className="dock-hint">房间号 {room.code}，先到 {view.target} 分的人敲响终局。</p>
            <p className="gw-bag">
              布袋里还剩
              {HUES.map((hue) => (
                <span key={hue} className={view.bag[hue] === 0 ? 'is-zero' : ''} title={PIECE_NAMES[hue]}>
                  <Shard piece={hue} />
                  {view.bag[hue]}
                </span>
              ))}
              <span className={view.gold === 0 ? 'is-zero' : ''} title="供应里的金箔">
                <Shard piece="gold" />
                {view.gold}
              </span>
            </p>
            <p className="dock-hint">最新的在最上面。</p>
            <ol className="ct-log">
              {[...view.log].reverse().map((e) => (
                <li key={e.seq}>{describe(e, nameOf, view.target)}</li>
              ))}
            </ol>
          </ResponsiveSheet>
        )}
        {showSeats && (
          <ResponsiveSheet key="seats" label="各家作坊" onClose={() => setShowSeats(null)} className="gw-seats-sheet">
            <header className="drawer-head">
              <h2>各家作坊</h2>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setShowSeats(null)}>
                关闭
              </button>
            </header>
            {[showSeats, ...view.players.filter((id) => id !== showSeats)].map((id) => (
              <Workshop key={id} player={playerOf(id)} seat={view.seats[id]!} isMe={id === meId} target={view.target} />
            ))}
          </ResponsiveSheet>
        )}
      </AnimatePresence>
    </main>
  );
}

/** 对手的一行：声望、料与炉色、图稿。点开看这家作坊的明细 */
function SeatStrip({ player, seat, active, first, onOpen }: { player: RoomPlayer; seat: Seat; active: boolean; first: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      className={`gw-seat ${active ? 'is-active' : ''} ${player.connected ? '' : 'is-offline'}`}
      aria-label={`${player.name} 的作坊，声望 ${seat.score.total}。点开看明细`}
      onClick={onOpen}
    >
      <span className="gw-seat-who">
        <span className="city-crest">
          <Crest seed={player.id} />
        </span>
        <span className="gw-seat-name">
          {player.name}
          {heatTarget(seat.heat) && <Flame />}
          <small>
            {first ? '先手' : ''}
            {!player.connected ? ' 掉线' : ''}
          </small>
        </span>
        {seat.sketches.length > 0 && <span className="gw-seat-sketchcount">稿 {seat.sketches.length}</span>}
        <span className="gw-score">
          {seat.score.total}
          <small>声望</small>
        </span>
      </span>
      <Palette seat={seat} />
      {seat.sketches.length > 0 && (
        <span className="gw-seat-sketches" title="图稿">
          {seat.sketches.map((s, i) => (
            <span key={s.id ?? `hidden-${i}`} className="gw-mini">
              {s.id ? <PanelCard panel={s.id} /> : <PanelBack tier={s.tier} />}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

/** 一家作坊的明细：分数怎么来的、每种炉色烧了哪几档、手里的料、图稿和委托 */
function Workshop({ player, seat, isMe, target }: { player: RoomPlayer; seat: Seat; isMe: boolean; target: number }) {
  const sets = Math.min(...HUES.map((h) => seat.kilns[h]));
  const lacking = HUES.filter((h) => seat.kilns[h] === sets);
  return (
    <section className="gw-workshop" aria-label={`${player.name} 的作坊`}>
      <header>
        <span className="city-crest">
          <Crest seed={player.id} />
        </span>
        <h3>
          {player.name}
          {isMe && <span className="seat-you">你</span>}
        </h3>
        <span className="gw-score">
          {seat.score.total}
          <small>/ {target}</small>
        </span>
      </header>
      <p className="gw-workshop-parts">
        {scoreParts(seat.score)}
        <HeatTag heat={seat.heat} long />
      </p>
      <table className="gw-matrix">
        <thead>
          <tr>
            <th scope="col">炉色</th>
            {HUES.map((h) => (
              <th key={h} scope="col" title={PIECE_NAMES[h]}>
                <KilnMark hue={h} />
                <b>{seat.kilns[h]}</b>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...TIERS].reverse().map((tier) => (
            <tr key={tier}>
              <th scope="row">{TIER_NAMES[tier]}</th>
              {HUES.map((h) => {
                const n = seat.tiers[h][tier - 1];
                return (
                  <td key={h} className={n > 0 ? 'is-on' : ''}>
                    {n > 0 ? n : '·'}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="gw-matrix-sets">
            <th scope="row">联窗</th>
            {HUES.map((h) => {
              const n = Math.min(...seat.tiers[h]);
              return (
                <td key={h} className={n > 0 ? 'is-on' : ''}>
                  {n > 0 ? `+${n * Glassworks.TRIPTYCH_BONUS}` : ''}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
      <p className="gw-workshop-note">
        光谱 {sets} 套{sets > 0 ? `，+${sets * Glassworks.SPECTRUM_BONUS}` : ''}。下一套还差{lacking.map((h) => PIECE_NAMES[h]).join('、')}。
      </p>
      <div className="gw-workshop-row">
        <span className="gw-workshop-label">手里的料</span>
        <span className="gw-workshop-glass">
          {PIECES.filter((piece) => seat.glass[piece] > 0).map((piece) => (
            <span key={piece}>
              <Shard piece={piece} />
              {seat.glass[piece]}
            </span>
          ))}
          {PIECES.every((piece) => seat.glass[piece] === 0) && '没有'}
        </span>
      </div>
      {seat.sketches.length > 0 && (
        <div className="gw-workshop-row">
          <span className="gw-workshop-label">图稿</span>
          <span className="gw-workshop-cards">
            {seat.sketches.map((s, i) => (
              <span key={s.id ?? `hidden-${i}`} className="gw-workshop-card">
                {s.id ? <PanelCard panel={s.id} /> : <PanelBack tier={s.tier} />}
              </span>
            ))}
          </span>
        </div>
      )}
      {seat.claimed.length > 0 && (
        <div className="gw-workshop-row">
          <span className="gw-workshop-label">委托</span>
          <span>{seat.claimed.map((c) => `${commissionOf(c).name}（+${commissionOf(c).points}）`).join('、')}</span>
        </div>
      )}
    </section>
  );
}

function EndScreen({ room, view }: { room: RoomSnapshot; view: View }) {
  const scores = view.scores!;
  const isHost = room.hostId === room.you;
  const host = room.players.find((p) => p.id === room.hostId);
  const winner = room.players.find((p) => p.id === view.winner);
  const ranked = [...room.players].sort((a, b) => (a.id === view.winner ? -1 : b.id === view.winner ? 1 : scores[b.id]!.total - scores[a.id]!.total));
  return (
    <main className="board board-ended">
      <header className="room-bar">
        <button type="button" className="link" onClick={net.leaveRoom}>
          离开
        </button>
        <div className="room-code">
          <span>房间号</span>
          <strong>{room.code}</strong>
        </div>
        <span />
      </header>
      <div className="end ct-end">
        <div className="end-head">
          <h1 className="end-title ct-end-title">
            <SplitText text={`${winner?.name ?? '？'} 的作坊名满全城`} stagger={0.06} />
          </h1>
          <p className="end-reason">{view.winner === room.you ? '你赢了这一局。' : `${winner?.name ?? ''} 以 ${scores[view.winner!]!.total} 点声望获胜。`}</p>
        </div>
        <ol className="ct-ranking">
          {ranked.map((p, i) => {
            const s = scores[p.id]!;
            const seat = view.seats[p.id]!;
            const parts = [
              `窗片 ${s.panels}`,
              s.commissions ? `委托 +${s.commissions}` : '',
              s.spectrum ? `光谱 +${s.spectrum}` : '',
              s.triptych ? `联窗 +${s.triptych}` : '',
            ].filter(Boolean);
            return (
              <motion.li
                key={p.id}
                className={`ct-rank ${p.id === view.winner ? 'is-winner' : ''}`}
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.14, type: 'spring', stiffness: 160, damping: 20 }}
              >
                <div className="ct-rank-who">
                  <span className="ct-rank-crest">
                    <Crest seed={p.id} />
                    {p.id === view.winner && (
                      <span className="city-crown">
                        <Crown />
                      </span>
                    )}
                  </span>
                  <div>
                    <div className="ct-rank-name">
                      {p.name}
                      {p.id === room.you && <span className="seat-you">你</span>}
                    </div>
                    <div className="ct-rank-parts">{parts.join('，')}</div>
                    <div className="ct-rank-parts">
                      烧成 {seat.panels.length} 块窗片{seat.claimed.length ? `，接下${seat.claimed.map((c) => commissionOf(c).name).join('、')}的委托` : ''}
                    </div>
                  </div>
                </div>
                <div className="gw-end-panels">
                  {[...seat.panels]
                    .sort((a, b) => panelOf(b).points - panelOf(a).points)
                    .map((id) => (
                      <span key={id} className="gw-mini">
                        <PanelCard panel={id} />
                      </span>
                    ))}
                </div>
                <div className="ct-rank-total">
                  {s.total}
                  <small>分</small>
                </div>
              </motion.li>
            );
          })}
        </ol>
        <div className="end-actions">
          {isHost ? (
            <button type="button" className="btn btn-primary" onClick={net.backToLobby}>
              回到大厅，再来一局
            </button>
          ) : (
            <p className="lobby-waiting">等 {host?.name ?? '房主'} 开下一局</p>
          )}
        </div>
      </div>
    </main>
  );
}
