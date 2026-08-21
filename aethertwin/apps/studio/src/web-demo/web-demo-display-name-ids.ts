import { message, type StudioMessageDescriptor } from "../i18n/format-message";
import type { DisplayNameSubject, DisplayNameSubjectKind, StudioDisplayNameResolver } from "../i18n/display-name-provider";

interface CanonicalDisplayNameId { readonly kind: DisplayNameSubjectKind; readonly id: string; readonly zh: string; readonly en: string; }
const prefix = "e2500000-0000-4000-8000-000000000";
const entry = (kind: DisplayNameSubjectKind, value: number, zh: string, en: string): CanonicalDisplayNameId => ({ kind, id: `${prefix}${String(value).padStart(3, "0")}`, zh, en });
const numbered = (kind: DisplayNameSubjectKind, first: number, values: readonly [string, string][]): CanonicalDisplayNameId[] => values.map(([zh, en], index) => entry(kind, first + index, zh, en));

const entries: readonly CanonicalDisplayNameId[] = [
  entry("project", 1, "AetherTwin 展厅演示", "AetherTwin Showroom Demo"), entry("floor", 2, "一层", "Level 1"), entry("layer", 3, "默认图层", "Default layer"), entry("plan-reference", 109, "已校准展厅平面图", "Calibrated showroom plan"),
  ...numbered("entity", 101, [["西北展厅", "Northwest Gallery"], ["东北展厅", "Northeast Gallery"], ["西南展厅", "Southwest Gallery"], ["东南展厅", "Southeast Gallery"]]), entry("entity", 110, "精选藏品区", "Featured Collection Zone"),
  ...numbered("entity", 201, [["西北北墙", "Northwest north wall"], ["东北北墙", "Northeast north wall"], ["西南北墙", "Southwest north wall"], ["东南北墙", "Southeast north wall"], ["西北西墙", "Northwest west wall"], ["东北西墙", "Northeast west wall"], ["西南西墙", "Southwest west wall"], ["东南西墙", "Southeast west wall"]]),
  ...numbered("entity", 401, [["展示柜 1", "display-case 1"], ["展示柜 2", "display-case 2"], ["展示柜 3", "display-case 3"], ["展示台 1", "display-table 1"], ["展示台 2", "display-table 2"], ["展示台 3", "display-table 3"], ["货架 1", "shelf 1"], ["货架 2", "shelf 2"], ["货架 3", "shelf 3"], ["收银台 1", "checkout 1"], ["收银台 2", "checkout 2"], ["收银台 3", "checkout 3"], ["屏幕 1", "screen 1"], ["屏幕 2", "screen 2"], ["屏幕 3", "screen 3"], ["隔断 1", "partition 1"], ["隔断 2", "partition 2"], ["隔断 3", "partition 3"], ["标识牌 1", "signage 1"], ["标识牌 2", "signage 2"], ["标识牌 3", "signage 3"], ["传统通用装置", "Legacy generic fixture"]]),
  ...numbered("entity", 701, Array.from({ length: 10 }, (_, index) => [`商品热点 ${index + 1}`, `Product hotspot ${index + 1}`] as [string, string])),
  ...numbered("entity", 301, [["展厅门 1", "Gallery door 1"], ["展厅门 2", "Gallery door 2"], ["展厅门 3", "Gallery door 3"], ["展厅门 4", "Gallery door 4"], ["展厅窗 1", "Gallery window 1"], ["展厅窗 2", "Gallery window 2"], ["展厅窗 3", "Gallery window 3"], ["展厅窗 4", "Gallery window 4"]]),
  ...numbered("product-content", 711, Array.from({ length: 10 }, (_, index) => [`商品内容 ${index + 1}`, `Product content ${index + 1}`] as [string, string])), ...numbered("media-asset", 721, Array.from({ length: 10 }, (_, index) => [`商品图片 ${index + 1}`, `Product image ${index + 1}`] as [string, string])),
  entry("route-network", 990, "展厅访客路线网络", "Showroom visitor network"), entry("guided-route", 991, "展厅导览路线", "Showroom guided tour"), ...numbered("material", 601, [["地面织物", "Floor textile"], ["墙面饰面", "Wall finish"], ["装置饰面", "Fixture finish"]]),
];

export const canonicalWebDemoDisplayNameIds = Object.freeze(entries.map(({ kind, id }) => Object.freeze({ kind, id })));
const descriptors = new Map(entries.map((value) => [`${value.kind}:${value.id}`, message("webDemo.displayName", { zh: value.zh, en: value.en })] as const));
export function resolveWebDemoDisplayName(subject: DisplayNameSubject): StudioMessageDescriptor | null { return descriptors.get(`${subject.kind}:${subject.id}`) ?? null; }
export const webDemoDisplayNameResolver: StudioDisplayNameResolver = resolveWebDemoDisplayName;
