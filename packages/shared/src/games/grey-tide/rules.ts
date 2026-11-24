export const ROUND_LIMIT = 8;

export const crews = { signal: '信号员', mechanic: '维修员' } as const;
export type Crew = keyof typeof crews;

export const sites = { radio: '电报室', workshop: '工具间', gallery: '外廊', lamp: '灯室' } as const;
export type Site = keyof typeof sites;

export const routes = {
  'radio-workshop': ['radio', 'workshop'],
  'radio-gallery': ['radio', 'gallery'],
  'workshop-lamp': ['workshop', 'lamp'],
  'gallery-lamp': ['gallery', 'lamp'],
} as const satisfies Record<string, readonly [Site, Site]>;
export type Route = keyof typeof routes;

export function routeName(route: Route) {
  const [from, to] = routes[route];
  return `${sites[from]} ↔ ${sites[to]}`;
}

export const parts = { bracket: '透镜托架', wire: '导电铜线' } as const;
export type Part = keyof typeof parts;
export const caches: Partial<Record<Site, Part>> = { workshop: 'bracket', gallery: 'wire' };

export const channels = {
  'north-long': { direction: '北方', flash: '长闪' },
  'north-short': { direction: '北方', flash: '短闪' },
  'south-long': { direction: '南方', flash: '长闪' },
  'south-short': { direction: '南方', flash: '短闪' },
} as const;
export type Channel = keyof typeof channels;
export type Reading = keyof typeof channels[Channel];

export function channelName(channel: Channel) {
  const { direction, flash } = channels[channel];
  return `${direction} · ${flash}`;
}

export interface Forecast {
  name: string;
  closure: Route | null;
}

export const forecasts: readonly Forecast[] = [
  { name: '潮间歇', closure: null },
  { name: '海雾贴岸', closure: 'radio-gallery' },
  { name: '楼梯积水', closure: 'workshop-lamp' },
  { name: '浪打栈道', closure: 'gallery-lamp' },
  { name: '短暂风歇', closure: null },
  { name: '水泵倒灌', closure: 'radio-workshop' },
  { name: '湿滑石阶', closure: 'radio-gallery' },
  { name: '栏杆松动', closure: 'gallery-lamp' },
];
