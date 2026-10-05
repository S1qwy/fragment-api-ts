import { load, type CheerioAPI, type Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import type * as M from "../types/results";
import { embeddedObject, integer, text } from "./validation";

type Node = Cheerio<AnyNode>;

/*
 * Preserve table-only AJAX fragments before constructing the HTML tree.
 *
 * Browsers and HTML parsers may discard orphaned table children. Supplying
 * the missing context keeps the same selectors usable for complete pages,
 * tbody fragments, and individual rows without regex-based row extraction.
 */
function tree(html: string): CheerioAPI {
  let source = html || "";
  if (!/<table\b/i.test(source)) {
    if (/<(?:thead|tbody|tfoot|tr)\b/i.test(source)) {
      source = `<table>${source}</table>`;
    } else if (/<(?:td|th)\b/i.test(source)) {
      source = `<table><tbody><tr>${source}</tr></tbody></table>`;
    }
  }
  return load(source);
}

function first(root: Node, ...selectors: string[]): Node {
  for (const selector of selectors) {
    const found = root.find(selector).first();
    if (found.length) return found;
  }
  return root.find("__missing__");
}

function words(node: Node): string {
  return node.text().replace(/\s+/g, " ").trim();
}

function status(node: Node): string {
  return words(node.find(".wide-only").first()) || words(node);
}

function clean(value: string): string {
  return value.replace(/[,\s\u00a0\u202f]/g, "");
}

function numeric(value: string): string | null {
  const result = clean(value).replace(/^\$/, "").replace(/(?:TON|GRAM|USD)$/i, "");
  return /^\+?\d+(?:\.\d*)?$/.test(result) ? result.replace(/^\+/, "") : null;
}

function price(node: Node): string | null {
  const value = numeric(node.text());
  if (value === null) return clean(node.text()) || null;
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.length < 2 ? fraction.padEnd(2, "0") : fraction}`;
}

function count(value: string): number {
  const digits = value.match(/\d[\d,\s\u00a0\u202f]*/)?.[0];
  const result = digits ? Number(clean(digits)) : 0;
  return Number.isSafeInteger(result) ? result : 0;
}

function integral(value: string): number {
  const raw = numeric(value);
  if (raw === null || /[1-9]/.test(raw.split(".")[1] ?? "")) return 0;
  const result = Number(raw);
  return Number.isSafeInteger(result) ? result : 0;
}

function date(root: Node): string | null {
  return root.find("time[datetime]").first().attr("datetime") ?? null;
}

function image(root: Node): string | null {
  const node = first(root, "img[src]", "img[data-src]");
  const value = node.attr("src") || node.attr("data-src") ||
    first(root, "source[srcset]", "img[srcset]").attr("srcset")
      ?.split(",")[0].trim().split(/\s+/)[0];
  return value?.replace(/\\\//g, "/") || null;
}

function offset(root: Node, selector = "[data-next-offset]"): string | null {
  for (const node of root.find(selector).toArray()) {
    const value = root.find(selector).filter((_, item) => item === node)
      .attr("data-next-offset");
    if (value) return value;
  }
  return null;
}

function slug(href: string, prefixes: string[]): string | null {
  try {
    const url = new URL(href.replace(/\\\//g, "/"), "https://fragment.com");
    if (url.origin !== "https://fragment.com") return null;
    const path = url.pathname.replace(/^\/+|\/+$/g, "");
    return prefixes.some(prefix => path.startsWith(`${prefix}/`) &&
      path.length > prefix.length + 1) ? path : null;
  } catch { return null; }
}

function asset(root: Node, prefixes: string[]): string | null {
  for (const href of root.find("a[href]").map((_, node) =>
    node.type === "tag" ? node.attribs.href : "").get()) {
    const result = slug(href, prefixes);
    if (result) return result;
  }
  return null;
}

function wallet(root: Node): string | null {
  for (const href of root.find("a[href]").map((_, node) =>
    node.type === "tag" ? node.attribs.href : "").get()) {
    try {
      const url = new URL(href);
      if (["tonviewer.com", "www.tonviewer.com"].includes(url.hostname)) {
        return url.pathname.replace(/^\/+|\/+$/g, "") || null;
      }
    } catch {}
  }
  return null;
}

function rowStatus(root: Node): string | null {
  const explicit = first(
    root, '[class*="tm-status-"]', ".tm-grid-item-status", ".table-cell-status"
  );
  if (explicit.length) return status(explicit) || null;
  for (let index = 1; index < root.find(".tm-value").length; index++) {
    const node = root.find(".tm-value").eq(index);
    const value = status(node);
    if (
      value && !/^[@+]/.test(value) && !node.find("time").length &&
      !node.hasClass("icon-ton") && numeric(value) === null
    ) return value;
  }
  return null;
}

export function parseAuctionRows(html: string): M.ListingItem[] {
  const $ = tree(html);
  const items: M.ListingItem[] = [];
  $("tr.tm-row-selectable").each((_, element) => {
    const row = $(element);
    const identifier = asset(row, ["username", "number"]);
    if (!identifier) return;
    items.push({
      slug: identifier,
      name: words(first(row, ".table-cell-value.tm-value", ".tm-value")) || identifier,
      status: rowStatus(row),
      price: price(row.find(".icon-ton").first()),
      date: date(row),
    });
  });
  return items;
}

export function parseListingOffset(html: string): string | null {
  return offset(tree(html).root());
}

export function parseGiftItems(html: string): [M.ListingItem[], number | null] {
  const $ = tree(html);
  const items: M.ListingItem[] = [];
  $("a.tm-grid-item").each((_, element) => {
    const card = $(element);
    const identifier = slug(card.attr("href") ?? "", ["gift"]);
    if (!identifier) return;
    let name = words(card.find(".item-name")) || identifier;
    const number = words(card.find(".item-num")).replace(/^#\s*/, "");
    if (number && !name.endsWith(`#${number}`)) name += ` #${number}`;
    items.push({
      slug: identifier, name,
      status: status(card.find(".tm-grid-item-status")) || null,
      price: price(first(card, ".tm-grid-item-value.icon-ton", ".icon-ton")),
      date: date(card),
    });
  });
  const cursor = offset($.root());
  return [
    items,
    cursor !== null && /^\d+$/.test(cursor)
      ? integer(Number(cursor), 0, Number.MAX_SAFE_INTEGER, "Gift cursor exceeds safe integer range.")
      : null,
  ];
}

/*
 * Scope history extraction to its own named section or pagination fragment.
 *
 * History rows retain full decimal strings and transferred ownership labels.
 * Unrelated tables are not used as a fallback when a named section is absent.
 */
function history(
  html: string,
  title: string,
  marker: string
): [M.BidHistoryEntry[], string | null] {
  const $ = tree(html);
  const matches = (node: Node): boolean => {
    const value = words(node).toLowerCase();
    return value === title.toLowerCase() ||
      value.startsWith(`${title.toLowerCase()} `);
  };
  let scope = $("section").filter((_, node) =>
    matches(first($(node), "h3", "h2", ".tm-section-header-text"))).first();
  if (!scope.length) {
    const heading = $("h3,h2").filter((_, node) => matches($(node))).first();
    if (heading.length) {
      scope = heading.parents().filter((_, node) =>
        !["body", "html"].includes(node.type === "tag" ? node.name : "") &&
        $(node).find("tr").length > 0).first();
    } else if ($(marker).length && !$("h2,h3").length) {
      scope = $.root() as any;
    }
  }
  if (!scope.length) return [[], null];
  const result: M.BidHistoryEntry[] = [];
  scope.find("tr").each((_, element) => {
    const row = $(element);
    if (!row.find("td").length) return;
    let value = numeric(row.find(".icon-ton").first().text());
    const label = words(first(row, ".table-cell-value.tm-value", ".table-cell-value"));
    if (!value && label.toLowerCase() === "transferred") value = "Transferred";
    if (!value) value = numeric(label);
    const entry = { price: value, date: date(row), wallet: wallet(row) };
    if (entry.price !== null || entry.date !== null || entry.wallet !== null) {
      result.push(entry);
    }
  });
  return [result, offset(scope, `${marker}[data-next-offset]`) ?? offset(scope)];
}

export function parseBidHistory(html: string): [M.BidHistoryEntry[], string | null] {
  return history(html, "Bid History", ".js-load-more-orders");
}

export function parseOwnerHistory(html: string): [M.OwnerHistoryEntry[], string | null] {
  return history(html, "Ownership History", ".js-load-more-owners");
}

export function parseOfferHistory(html: string): [M.OfferHistoryEntry[], string | null] {
  return history(html, "Latest Offers", ".js-load-more-offers");
}

export function parseItemStatus(html: string): string {
  return status(tree(html)('[class*="tm-section-header-status"]').first()) || "Unknown";
}

export function parseSoldOwner(html: string): string | null {
  return wallet(tree(html)(".tm-section-bid-info").first());
}

export function parseAuctionInfo(html: string): M.AuctionInfo {
  const $ = tree(html);
  const result: M.AuctionInfo = {};
  const labels: Record<string, keyof M.AuctionInfo> = {
    "highest bid": "highestBid", "current bid": "highestBid",
    "bid step": "bidStep", "minimum bid": "minimumBid", "min bid": "minimumBid",
    "sell price": "sellPrice", "sale price": "sellPrice",
    "buy now": "buyNowPrice", "buy now price": "buyNowPrice",
  };
  const assign = (label: Node, cell: Node): void => {
    const key = labels[words(label).toLowerCase().replace(/:$/, "")];
    const value = numeric(cell.find(".icon-ton").first().text());
    if (key && value !== null && result[key] == null) result[key] = value;
  };
  $("table").each((_, table) => {
    const rows = $(table).find("tr");
    rows.each((index, element) => {
      const row = $(element);
      const headers = row.children("th");
      const cells = row.children("td");
      if (headers.length === 1 && cells.length) assign(headers.first(), row);
      if (headers.length > 1) {
        for (let next = index + 1; next < rows.length; next++) {
          const values = rows.eq(next).children("td");
          if (values.length !== headers.length) continue;
          headers.each((column, heading) => assign($(heading), values.eq(column)));
          break;
        }
      }
      if (cells.length >= 2) assign(cells.eq(0), cells.eq(1));
    });
  });
  $(".tm-section-bid-info .table-cell").each((_, element) => {
    const node = $(element);
    assign(first(node, ".table-cell-desc", ".table-cell-label"), node);
  });
  const buy = $(".js-buy-now-btn[data-bid-amount]").first().attr("data-bid-amount");
  if (buy) result.buyNowPrice = buy;
  return result;
}

export function parseGiftAttributes(html: string): M.GiftAttribute[] {
  const $ = tree(html);
  const result: M.GiftAttribute[] = [];
  $("tr").each((_, element) => {
    const cells = $(element).children("td");
    if (cells.length < 2) return;
    const name = words(cells.eq(0));
    if (!name || /^(owner|issued)$/i.test(name)) return;
    const node = first(cells.eq(1), ".table-cell-value.tm-value", ".table-cell-value");
    if (!node.length || node.find(".icon-ton").length || node.hasClass("icon-ton")) return;
    const copy = node.clone();
    copy.find(".tm-rarity").remove();
    const value = words(node.find("a").first()) || words(copy);
    if (value) result.push({
      name, value, rarity: words(cells.eq(1).find(".tm-rarity")) || null,
    });
  });
  return result;
}

export function parseGiftIssued(html: string): string | null {
  const $ = tree(html);
  for (const element of $("tr").toArray()) {
    const cells = $(element).children("td");
    if (words(cells.eq(0)).toLowerCase() === "issued") {
      return words(cells.eq(1)) || null;
    }
  }
  return null;
}

export function parseStarsPriceFromHtml(html: string): [string | null, string | null] {
  const $ = tree(html);
  const native = numeric($(".icon-ton").first().text());
  let usd = numeric($(".icon-usd").first().text());
  if (usd === null) {
    const match = /\$\s*(\d[\d,\u00a0\u202f]*(?:\.\d+)?)/.exec($.root().text());
    usd = match ? numeric(match[1]) : null;
  }
  return [native, usd];
}

export function parseStarsPackages(html: string): M.StarsPrice[] {
  const $ = tree(html);
  const result = new Map<number, M.StarsPrice>();
  $("label").each((_, element) => {
    const label = $(element);
    const stars = Number(label.find('input[name="stars"]').attr("value"));
    if (!Number.isSafeInteger(stars) || stars <= 0) return;
    const [native, usd] = parseStarsPriceFromHtml($.html(element));
    if (native === null) return;
    result.set(stars, {
      stars, gramPrice: native, tonPrice: native,
      usdPrice: usd ?? result.get(stars)?.usdPrice ?? "0",
    });
  });
  return [...result.values()];
}

export function parsePremiumOptions(html: string): M.PremiumPriceOption[] {
  const $ = tree(html);
  const result = new Map<number, M.PremiumPriceOption>();
  $("label").each((_, element) => {
    const label = $(element);
    const months = Number(label.find('input[name="months"]').attr("value"));
    if (![3, 6, 12].includes(months)) return;
    const [native, usd] = parseStarsPriceFromHtml($.html(element));
    if (native === null) return;
    const copy = label.find(".tm-radio-label").clone();
    copy.find(".tm-radio-label-badge").remove();
    result.set(months, {
      months, label: words(copy) || `${months} months`,
      gramPrice: native, tonPrice: native,
      usdPrice: usd ?? result.get(months)?.usdPrice ?? "0",
      discount: words(label.find(".tm-radio-label-badge")) ||
        result.get(months)?.discount || null,
    });
  });
  return [...result.values()];
}

function dataRows($: CheerioAPI): Node[] {
  return $("tr").toArray().map(node => $(node))
    .filter(row => row.find("td").length > 0 && row.find("th").length === 0);
}

export function parseStarsHistory(html: string): M.StarsTransaction[] {
  const $ = tree(html);
  return dataRows($).flatMap(row => {
    const recipient = words(row.find(".tm-inline-nowrap").first()).replace(/^@/, "");
    const native = clean(row.find(".icon-ton").first().text());
    return recipient ? [{
      recipient,
      stars: integral(row.find(".tm-value.tm-nowrap").first().text()),
      priceGram: native, priceTon: native, date: date(row) ?? "",
    }] : [];
  });
}

export function parsePremiumHistory(html: string): M.PremiumTransaction[] {
  const $ = tree(html);
  return dataRows($).flatMap(row => {
    const recipient = words(row.find(".tm-inline-nowrap").first()).replace(/^@/, "");
    const duration = row.find(".tm-nowrap").toArray().map(node => words($(node)))
      .find(value => /\b(months?|years?)\b/i.test(value)) ?? "";
    const native = clean(row.find(".icon-ton").first().text());
    return recipient ? [{
      recipient, duration, priceGram: native, priceTon: native, date: date(row) ?? "",
    }] : [];
  });
}

export function parseTopupHistory(html: string): M.TopupTransaction[] {
  const $ = tree(html);
  return dataRows($).flatMap(row => {
    const link = row.find('a[href*="t.me/"]').first();
    let recipient = words(link).replace(/^@/, "");
    if (!recipient && link.attr("href")) {
      try { recipient = new URL(link.attr("href")!).pathname.replace(/^\/|\/$/g, ""); }
      catch {}
    }
    return recipient ? [{
      recipient,
      amount: integral(row.find(".icon-ton").first().text()),
      date: date(row) ?? "",
    }] : [];
  });
}

export function parseProfile(html: string): M.ProfileInfo {
  const $ = tree(html);
  let account = $(".tm-settings-account,.tm-settings-item-account").first();
  if (!account.length) account = $.root() as any;
  const scope = (title: string): Node => {
    const heading = $(".tm-settings-item-head,h3,h4").filter((_, node) =>
      words($(node)).toLowerCase().includes(title.toLowerCase())).first();
    const parent = heading.closest(".tm-settings-item");
    return parent.length ? parent : heading.parent();
  };
  const linked = scope("Linked Wallet");
  const identity = scope("Identity");
  let address: string | null = null;
  if (html.includes("Wallet.init(")) {
    try {
      const value = embeddedObject(html, "Wallet.init(").address;
      if (typeof value === "string" && !/^(false|null)?$/i.test(value)) address = value;
    } catch {}
  }
  return {
    name: words(account.find(".tm-settings-item-head").first()),
    username: words(account.find(".tm-settings-item-desc").first()).replace(/^@/, ""),
    photoUrl: image($(".tm-settings-account-photo")),
    identityVerified: identity.find(".tm-badge-verified").length > 0 ||
      $(".tm-badge-verified").toArray().some(node => /identity/i.test(words($(node)))),
    walletAddress: address,
    walletLabel: words(first(
      linked, ".tm-settings-item-desc .short", ".short", ".tm-wallet", ".tm-settings-item-desc"
    )) || null,
    walletVerified: linked.find(".tm-badge-verified").length > 0,
  };
}

function tabTotal($: CheerioAPI, category: string, bids: boolean): number | null {
  for (const element of $("a[href]").toArray()) {
    const link = $(element);
    let url: URL;
    try { url = new URL(link.attr("href")!, "https://fragment.com"); }
    catch { continue; }
    if (bids) {
      if (
        url.pathname !== "/my/bids" ||
        (url.searchParams.get("type") ?? "usernames") !== category
      ) continue;
    } else if (url.pathname !== `/my/${category}`) continue;
    for (const span of link.find("span").toArray().reverse()) {
      const value = words($(span));
      if (/^[\d,\s\u00a0\u202f]+$/.test(value)) return count(value);
    }
  }
  return null;
}

const prefixes: Record<string, string> = {
  usernames: "username", numbers: "number", gifts: "gift",
};

export function parseMyBids(html: string, itemType: string): [M.MyBid[], number] {
  const $ = tree(html);
  const result: M.MyBid[] = [];
  if (!prefixes[itemType]) return [[], 0];
  $("tr.tm-row-selectable").each((_, element) => {
    const row = $(element);
    const identifier = asset(row, [prefixes[itemType]]);
    if (!identifier) return;
    let name = words(first(row, ".table-cell-value.tm-value", ".tm-value")) || identifier;
    if (itemType === "usernames" && name !== identifier) name = `@${name.replace(/^@/, "")}`;
    result.push({
      itemType, slug: identifier, name,
      bid: Number(numeric(row.find(".icon-ton").first().text()) ?? 0),
      status: rowStatus(row) ?? "Unknown",
      date: date(row) ?? "",
      imageUrl: itemType === "gifts" ? image(row) : null,
      description: words(row.find(".table-cell-desc").first()) || null,
    });
  });
  return [result, tabTotal($, itemType, true) ?? result.length];
}

export function parseAssignAccounts(html: string): [M.TelegramAccount[], boolean] {
  const $ = tree(html);
  const popup = $(".js-assign-popup");
  const accounts = new Map<string, M.TelegramAccount>();
  popup.find("label.tm-assign-account-item").each((_, element) => {
    const label = $(element);
    const id = label.find("input[value]").attr("value");
    if (id === undefined) return;
    accounts.set(id, {
      id, name: words(label.find(".tm-assign-account-name")) || "Unknown",
      type: words(label.find(".tm-assign-account-desc")) || "Unknown",
      photoUrl: image(label),
    });
  });
  return [[...accounts.values()], /don't display on telegram/i.test(
    words(popup).replace(/’/g, "'")
  )];
}

export function parseMyAssets(html: string, itemType: string): [M.MyAsset[], number] {
  const $ = tree(html);
  const result: M.MyAsset[] = [];
  if (!prefixes[itemType]) return [[], 0];
  const [accounts] = parseAssignAccounts(html);
  const names = new Map(accounts.map(account => [account.id, account.name]));
  $("tr.tm-row-selectable").each((_, element) => {
    const row = $(element);
    const identifier = asset(row, [prefixes[itemType]]);
    if (!identifier) return;
    let name = words(first(row, ".table-cell-value.tm-value", ".tm-value")) || identifier;
    if (itemType === "usernames" && name !== identifier) name = `@${name.replace(/^@/, "")}`;
    const assignedTo = row.attr("data-assigned-to") ||
      row.find("[data-assigned-to]").first().attr("data-assigned-to") || null;
    const assigned = row.find(".js-assigned-to");
    result.push({
      itemType, slug: identifier, name,
      description: words(row.find(".table-cell-desc").first()) || null,
      imageUrl: itemType === "gifts" ? image(row) : null,
      assignedTo,
      assignedName: names.get(assignedTo ?? "") || words(assigned) ||
        (itemType === "gifts" && assigned.length ? "Wallet" : null),
    });
  });
  return [result, tabTotal($, itemType, false) ?? result.length];
}

export function parseSessions(html: string): M.SessionInfo[] {
  const $ = tree(html);
  return dataRows($).flatMap(row => {
    const device = words(first(row, ".table-cell-value.tm-value", ".table-cell-value"));
    const sessionId = row.attr("data-session-id") ||
      row.find("[data-session-id]").first().attr("data-session-id") || "";
    if (!device && !sessionId) return [];
    const location = row.find(".table-cell-desc-col").toArray().map(node => $(node))
      .filter(node => !node.find("time").length)
      .map(words).find(value =>
        value && !/^(now\b|today\b|yesterday\b|last seen\b|\d+\s+\w+\s+ago\b)/i.test(value)
      ) ?? "";
    const isCurrent = /current/i.test(status(row.find('[class*="tm-status-"]').first()));
    return [{
      sessionId, device, location, isCurrent,
      date: date(row) ?? (isCurrent ? "now" : null),
    }];
  });
}

export function parseLoginCode(html: string): [string | null, number] {
  const $ = tree(html);
  let code: string | null = null;
  for (const element of $(".table-cell-value").toArray()) {
    const value = words($(element));
    const digits = value.replace(/[\s-]/g, "");
    if (/^\d[\d\s-]*$/.test(value) && /^\d{4,8}$/.test(digits)) {
      code = digits;
      break;
    }
  }
  return [code, dataRows($).length];
}

/*
 * Merge responsive filter duplicates using their stable protocol identifiers.
 *
 * Existing names and preview images survive sparse duplicates. Counts use
 * the maximum displayed value, and category headers are read without their
 * nested trait items so that item counts cannot replace category counts.
 */
export function parseGiftFilters(html: string): M.GiftFiltersInfo {
  const $ = tree(html);
  const collections = new Map<string, M.GiftCollection>();
  const categories = new Map<string, M.GiftAttributeCategory>();
  $("a.js-choose-collection-item[data-value]").each((_, element) => {
    const node = $(element);
    const identifier = node.attr("data-value") ?? "";
    if (!identifier) return;
    const candidate: M.GiftCollection = {
      slug: identifier,
      name: node.attr("data-keywords") || words(first(
        node, ".tm-main-filters-name", ".tm-popup-filters-name"
      )),
      count: count(words(first(node, ".tm-main-filters-count", ".tm-popup-filters-desc"))),
      imageUrl: image(node),
    };
    const previous = collections.get(identifier);
    collections.set(identifier, previous ? {
      ...previous,
      name: previous.name || candidate.name,
      count: Math.max(previous.count, candidate.count),
      imageUrl: previous.imageUrl || candidate.imageUrl,
    } : candidate);
  });
  $(".js-attribute[data-field]").each((_, element) => {
    const box = $(element);
    const field = box.attr("data-field") ?? "";
    if (!field) return;
    const fallback = /^attr\[(.+)]$/.exec(field)?.[1] ?? field;
    const header = box.clone();
    header.find(".js-attribute-item").remove();
    const name = words(first(header, ".tm-main-filters-name", ".tm-popup-filters-name")) || fallback;
    const total = count(words(first(
      header, ".js-filter-cnt", ".tm-main-filters-count", ".tm-popup-filters-count"
    )));
    const category = categories.get(field) ?? { field, name, totalCount: total, items: [] };
    category.totalCount = Math.max(category.totalCount, total);
    if (!category.name || category.name === fallback) category.name = name;
    const values = new Map(category.items.map(item => [item.value, item]));
    box.find(".js-attribute-item[data-value]").each((_, itemElement) => {
      const node = $(itemElement);
      const value = node.attr("data-value") ?? "";
      if (!value) return;
      const candidate: M.GiftAttributeValue = {
        value,
        name: node.attr("data-keywords") ||
          words(first(node, ".tm-main-filters-name", ".tm-popup-filters-name")) || value,
        count: count(words(first(node, ".tm-main-filters-count", ".tm-popup-filters-desc"))),
        imageUrl: image(node),
      };
      const previous = values.get(value);
      values.set(value, previous ? {
        ...previous,
        name: previous.name && previous.name !== value ? previous.name : candidate.name,
        count: Math.max(previous.count, candidate.count),
        imageUrl: previous.imageUrl || candidate.imageUrl,
      } : candidate);
    });
    category.items = [...values.values()];
    categories.set(field, category);
  });
  return { collections: [...collections.values()], attributes: [...categories.values()] };
}