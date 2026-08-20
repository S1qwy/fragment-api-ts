import {
  AuctionInfo,
  BidHistoryEntry,
  GiftAttribute,
  MyAsset,
  MyBid,
  OfferHistoryEntry,
  OwnerHistoryEntry,
  PremiumPriceOption,
  PremiumTransaction,
  ProfileInfo,
  SessionInfo,
  StarsPrice,
  StarsTransaction,
  TelegramAccount,
  TopupTransaction,
} from "../types/results";

function matchAll(re: RegExp, text: string): RegExpExecArray[] {
  const results: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  while ((m = r.exec(text)) !== null) results.push(m);
  return results;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

/**
 * Parse Fragment marketplace HTML into structured item dicts.
 */
export function parseAuctionRows(html: string): Record<string, any>[] {
  const items: Record<string, any>[] = [];
  const rowRe = /<tr[^>]*class="[^"]*tm-row-selectable[^"]*"[^>]*>(.*?)<\/tr>/gs;
  const hrefRe = /href="(\/(?:username|number|nft)\/([^"]+))"/;
  const valueRe = /class="[^"]*tm-value[^"]*"[^>]*>\s*([^<]+?)\s*</g;
  const priceRe = /icon-before\s+icon-ton[^>]*>\s*([0-9][^<]*?)\s*</;
  const dtRe = /<time[^>]+datetime="([^"]+)"[^>]*data-relative="(?:text|short-text)"[^>]*>/;

  for (const rowMatch of matchAll(rowRe, html)) {
    const row = rowMatch[1];
    const hrefM = hrefRe.exec(row);
    if (!hrefM) continue;

    const slug = hrefM[1].replace(/^\//, "");
    const values = matchAll(valueRe, row).map((m) => m[1].trim());
    const name = values[0] || slug;

    let status: string | null = null;
    for (const v of values.slice(1)) {
      if (v && v !== "Unknown" && !v.startsWith("@") && !/^\+?[\d,. ]+$/.test(v)) {
        status = v;
        break;
      }
    }

    const priceM = priceRe.exec(row);
    let price: string | null = null;
    if (priceM) {
      const raw = priceM[1].trim().replace(/,/g, "");
      const num = parseFloat(raw);
      price = isNaN(num) ? raw : num.toFixed(2);
    }

    const timeM = dtRe.exec(row);
    const date = timeM ? timeM[1] : null;

    items.push({ slug, name, status, price, date });
  }
  return items;
}

/**
 * Parse Fragment gifts grid HTML into structured item dicts.
 */
export function parseGiftItems(html: string): [Record<string, any>[], number | null] {
  const items: Record<string, any>[] = [];
  const itemRe = /<a[^>]*class="[^"]*tm-grid-item[^"]*"[^>]*>(.*?)<\/a>/gs;
  const hrefRe = /href="(\/gift\/([^?"]+))/;
  const nameRe = /class="item-name">([^<]+)</;
  const numRe = /class="item-num">[^#]*#(\w+)</;
  const priceRe = /class="[^"]*tm-grid-item-value[^"]*icon-ton[^"]*"[^>]*>\s*([0-9][^<]*?)\s*</;
  const statusRe = /class="[^"]*tm-grid-item-status[^"]*"[^>]*>\s*([^<]+?)\s*</;
  const dtRe = /<time[^>]+datetime="([^"]+)"/;

  for (const im of matchAll(itemRe, html)) {
    const block = im[0];
    const hm = hrefRe.exec(block);
    if (!hm) continue;
    const slug = hm[1].replace(/^\//, "");
    const nm = nameRe.exec(block);
    const numM = numRe.exec(block);
    const itemName = nm ? nm[1].trim() : slug;
    const itemNum = numM ? ` #${numM[1]}` : "";
    const name = `${itemName}${itemNum}`;

    const sm = statusRe.exec(block);
    const status = sm ? sm[1].trim() : null;

    const pm = priceRe.exec(block);
    let price: string | null = null;
    if (pm) {
      const raw = pm[1].trim().replace(/,/g, "");
      const num = parseFloat(raw);
      price = isNaN(num) ? raw : num.toFixed(2);
    }

    const tm = dtRe.exec(block);
    const date = tm ? tm[1] : null;

    items.push({ slug, name, status, price, date });
  }

  const offsetM = /data-next-offset="(\d+)"/.exec(html);
  const nextOffset = offsetM ? parseInt(offsetM[1], 10) : null;

  return [items, nextOffset];
}

function parseTableRows(html: string): Record<string, any>[] {
  const entries: Record<string, any>[] = [];
  const rowRe = /<tr>\s*(.*?)\s*<\/tr>/gs;
  const priceTonRe = /icon-before\s+icon-ton[^>]*>\s*([^<]+?)\s*</;
  const valueRe = /table-cell-value\s+tm-value[^"]*"[^>]*>\s*([^<]+?)\s*</;
  const dtRe = /<time[^>]+datetime="([^"]+)"/;
  const walletRe = /href="(https:\/\/tonviewer\.com\/[^"]+)"/;

  for (const rm of matchAll(rowRe, html)) {
    const row = rm[1];
    if (row.includes("table-cell-more") || row.includes("<th")) continue;
    if (!row.includes("table-cell")) continue;

    let price: string | null = null;
    let priceLabel: string | null = null;
    const pm = priceTonRe.exec(row);
    const vm = valueRe.exec(row);
    if (pm) {
      price = pm[1].trim().replace(/,/g, "");
    } else if (vm) {
      const val = vm[1].trim();
      if (val === "Transferred") priceLabel = "Transferred";
      else price = val.replace(/,/g, "");
    }

    const dm = dtRe.exec(row);
    const date = dm ? dm[1] : null;

    const wm = walletRe.exec(row);
    const wallet = wm ? wm[1].replace("https://tonviewer.com/", "") : null;

    entries.push({ price, priceLabel, date, wallet });
  }
  return entries;
}

export function parseBidHistory(html: string): [BidHistoryEntry[], string | null] {
  let section = "";
  const m = html.match(/Bid History<\/h3>.*?<\/section>/s);
  if (m) section = m[0];

  const entries = parseTableRows(section);
  const bids: BidHistoryEntry[] = entries.map((e) => ({
    price: e.price,
    date: e.date,
    wallet: e.wallet,
  }));

  const offsetM = /js-load-more-orders["\s][^>]*data-next-offset="([^"]+)"/.exec(section);
  return [bids, offsetM ? offsetM[1] : null];
}

export function parseOwnerHistory(html: string): [OwnerHistoryEntry[], string | null] {
  let section = "";
  const m = html.match(/Ownership History<\/h3>.*?<\/section>/s);
  if (m) section = m[0];

  const entries = parseTableRows(section);
  const owners: OwnerHistoryEntry[] = entries.map((e) => ({
    price: e.priceLabel || e.price,
    date: e.date,
    wallet: e.wallet,
  }));

  const offsetM = /js-load-more-owners["\s][^>]*data-next-offset="([^"]+)"/.exec(section);
  return [owners, offsetM ? offsetM[1] : null];
}

export function parseOfferHistory(html: string): [OfferHistoryEntry[], string | null] {
  let section = "";
  const m = html.match(/Latest Offers<\/h3>.*?<\/section>/s);
  if (m) section = m[0];

  const entries = parseTableRows(section);
  const offers: OfferHistoryEntry[] = entries.map((e) => ({
    price: e.price,
    date: e.date,
    wallet: e.wallet,
  }));

  const offsetM = /js-load-more-offers["\s][^>]*data-next-offset="([^"]+)"/.exec(section);
  return [offers, offsetM ? offsetM[1] : null];
}

export function parseItemStatus(html: string): string {
  const m = /tm-section-header-status[^"]*"[^>]*>\s*([^<]+?)\s*</.exec(html);
  return m ? m[1].trim() : "Unknown";
}

export function parseAuctionInfo(html: string): AuctionInfo {
  const info: AuctionInfo = {};

  const bidTableMatch = html.match(
    /<table[^>]*class="[^"]*tm-table[^"]*"[^>]*>.*?Highest Bid.*?Bid Step.*?Minimum Bid.*?<\/tbody>/s
  );

  if (bidTableMatch) {
    const tableHtml = bidTableMatch[0];
    const cellValues = matchAll(
      /class="table-cell-value tm-value icon-before icon-ton">([^<]+)<\/div>/g,
      tableHtml
    ).map((m) => m[1].trim().replace(/,/g, ""));

    if (cellValues.length >= 1) info.highestBid = cellValues[0];
    if (cellValues.length >= 2) info.bidStep = cellValues[1];
    if (cellValues.length >= 3) info.minimumBid = cellValues[2];
  }

  const sellM = html.match(/Sell Price[^<]*<\/th>.*?icon-before\s+icon-ton[^>]*>\s*([^<]+)/s);
  if (sellM) info.sellPrice = sellM[1].trim().replace(/,/g, "");

  const buyM = /js-buy-now-btn["\s][^>]*data-bid-amount="([^"]+)"/.exec(html);
  if (buyM) info.buyNowPrice = buyM[1].trim();

  return info;
}

export function parseSoldOwner(html: string): string | null {
  const m = /(?:Sale Price|Owner).*?class="tm-wallet"[^>]*>.*?<span class="(?:head|short)">([^<]+)<\/span>/s.exec(html);
  return m ? m[1].trim() : null;
}

export function parseGiftAttributes(html: string): GiftAttribute[] {
  const attrs: GiftAttribute[] = [];
  const re = /<tr>\s*<td>\s*<div class="table-cell">([^<]+)<\/div>\s*<\/td>\s*<td>\s*<div class="table-cell">\s*<div class="table-cell-value tm-value">\s*(?:<a[^>]*>([^<]+)<\/a>|([^<]+?))\s*(?:<span class="tm-rarity">\s*([^<]+?)\s*<\/span>)?/gs;

  for (const m of matchAll(re, html)) {
    const name = m[1].trim();
    const value = (m[2] || m[3] || "").trim();
    const rarity = m[4] ? m[4].trim() : null;
    if (name && value && name !== "Owner" && name !== "Issued") {
      attrs.push({ name, value, rarity });
    }
  }
  return attrs;
}

export function parseGiftIssued(html: string): string | null {
  const m = /Issued<\/div>\s*<\/td>\s*<td>\s*<div class="table-cell">\s*<div[^>]*>\s*([^<]+?)\s*<\/div>/s.exec(html);
  return m ? m[1].trim() : null;
}

export function parseStarsPackages(html: string): StarsPrice[] {
  const packages: StarsPrice[] = [];
  const re = /<input[^>]*name="stars"[^>]*value="(\d+)"[^>]*>.*?(?=<\/label>)/gs;

  for (const m of matchAll(re, html)) {
    const stars = parseInt(m[1], 10);
    const block = m[0];

    const tonM = /icon-ton[^>]*>([^<]*(?:<span[^>]*>[^<]*<\/span>)?)/.exec(block);
    const tonRaw = tonM ? stripTags(tonM[1]).replace(/,/g, "").trim() : "0";

    let usdM = /icon-usd[^>]*>([^<]+)/.exec(block);
    if (!usdM) usdM = /(?:&#036;|\$)\s*([\d.,]+)/.exec(block);
    const usdRaw = usdM ? usdM[1].replace(/,/g, "").trim() : "0";

    packages.push({ stars, gramPrice: tonRaw, usdPrice: usdRaw });
  }
  return packages;
}

export function parseStarsPriceFromHtml(html: string): [string | null, string | null] {
  const tonM = /icon-ton[^>]*>([^<]*(?:<span[^>]*>[^<]*<\/span>)?)/.exec(html);
  const gramPrice = tonM ? stripTags(tonM[1]).replace(/,/g, "").trim() : null;

  let usdM = /icon-usd[^>]*>([^<]+)/.exec(html);
  if (!usdM) usdM = /(?:&#036;|\$)\s*([\d.,]+)/.exec(html);
  const usdPrice = usdM ? usdM[1].replace(/,/g, "").trim() : null;

  return [gramPrice, usdPrice];
}

export function parsePremiumOptions(html: string): PremiumPriceOption[] {
  const options: PremiumPriceOption[] = [];
  const re = /<input[^>]*name="months"[^>]*value="(\d+)"[^>]*>.*?(?=<\/label>)/gs;

  for (const m of matchAll(re, html)) {
    const months = parseInt(m[1], 10);
    const block = m[0];

    const labelM = /<div class="tm-radio-label">([^<]+)/.exec(block);
    const label = labelM ? labelM[1].trim() : `${months} months`;

    const discountM = /<span class="tm-radio-label-badge">([^<]+)<\/span>/.exec(block);
    const discount = discountM ? discountM[1].trim() : null;

    const tonM = /icon-ton[^>]*>([^<]*(?:<span[^>]*>[^<]*<\/span>)?)/.exec(block);
    const tonRaw = tonM ? stripTags(tonM[1]).replace(/,/g, "").trim() : "0";

    let usdM = /(?:&#036;|\$)\s*([\d.,]+)/.exec(block);
    if (!usdM) usdM = /icon-usd[^>]*>([^<]+)/.exec(block);
    const usdRaw = usdM ? usdM[1].replace(/,/g, "").trim() : "0";

    options.push({ months, label, gramPrice: tonRaw, usdPrice: usdRaw, discount });
  }
  return options;
}

export function parseStarsHistory(html: string): StarsTransaction[] {
  const transactions: StarsTransaction[] = [];
  const tbodyM = /<tbody>(.*?)<\/tbody>/s.exec(html);
  if (!tbodyM) return transactions;

  const rowRe = /<tr>\s*(.*?)\s*<\/tr>/gs;
  for (const rm of matchAll(rowRe, tbodyM[1])) {
    const row = rm[1];
    if (row.includes("<th")) continue;

    const recipM = /class="tm-inline-nowrap">@([^<]+)</.exec(row);
    const recipient = recipM ? recipM[1].trim() : "";

    const starsM = /tm-value\s+tm-nowrap[^"]*"[^>]*>\s*([^<]+?)\s*</.exec(row);
    const starsStr = starsM ? starsM[1].trim().replace(/,/g, "") : "0";
    const stars = parseInt(starsStr, 10) || 0;

    const priceM = /icon-before\s+icon-ton[^>]*>\s*([^<]+?)\s*</.exec(row);
    let priceRaw = "";
    if (priceM) {
      priceRaw = stripTags(priceM[1].trim()).replace(/\s/g, "").replace(/,/g, "");
    }

    const dateM = /<time[^>]+datetime="([^"]+)"/.exec(row);
    const date = dateM ? dateM[1] : "";

    if (recipient) {
      transactions.push({ recipient, stars, priceGram: priceRaw, date });
    }
  }
  return transactions;
}

export function parsePremiumHistory(html: string): PremiumTransaction[] {
  const transactions: PremiumTransaction[] = [];
  const tbodyM = /<tbody>(.*?)<\/tbody>/s.exec(html);
  if (!tbodyM) return transactions;

  const rowRe = /<tr>\s*(.*?)\s*<\/tr>/gs;
  for (const rm of matchAll(rowRe, tbodyM[1])) {
    const row = rm[1];
    if (row.includes("<th")) continue;

    const recipM = /class="tm-inline-nowrap">@([^<]+)</.exec(row);
    const recipient = recipM ? recipM[1].trim() : "";

    const durM = /tm-nowrap[^"]*"[^>]*>\s*([^<]+?)\s*</.exec(row);
    const duration = durM ? durM[1].trim() : "";

    const priceM = /icon-before\s+icon-ton[^>]*>\s*([^<]+?)\s*</.exec(row);
    let priceRaw = "";
    if (priceM) {
      priceRaw = stripTags(priceM[1].trim()).replace(/\s/g, "").replace(/,/g, "");
    }

    const dateM = /<time[^>]+datetime="([^"]+)"/.exec(row);
    const date = dateM ? dateM[1] : "";

    if (recipient) {
      transactions.push({ recipient, duration, priceGram: priceRaw, date });
    }
  }
  return transactions;
}

export function parseTopupHistory(html: string): TopupTransaction[] {
  const transactions: TopupTransaction[] = [];
  const tbodyM = /<tbody>(.*?)<\/tbody>/s.exec(html);
  if (!tbodyM) return transactions;

  const rowRe = /<tr>\s*(.*?)\s*<\/tr>/gs;
  for (const rm of matchAll(rowRe, tbodyM[1])) {
    const row = rm[1];
    if (row.includes("<th")) continue;

    const recipM = /<a[^>]+href="https:\/\/t\.me\/([^"]+)"[^>]*>@([^<]+)<\/a>/.exec(row);
    const recipient = recipM ? recipM[2] : "";

    const amountM = /icon-before\s+icon-ton[^>]*>\s*([^<]+?)\s*</.exec(row);
    let amount = 0;
    if (amountM) {
      amount = parseInt(amountM[1].trim().replace(/,/g, ""), 10) || 0;
    }

    const dateM = /<time[^>]+datetime="([^"]+)"/.exec(row);
    const date = dateM ? dateM[1] : "";

    transactions.push({ recipient, amount, date });
  }
  return transactions;
}

export function parseProfile(html: string): ProfileInfo {
  const nameM = /tm-settings-item-head">([^<]+)</.exec(html);
  const name = nameM ? nameM[1].trim() : "";

  const userM = /tm-settings-item-desc">@([^<]+)</.exec(html);
  const username = userM ? userM[1].trim() : "";

  const photoM = /tm-settings-account-photo[^>]*>\s*<img\s+src="([^"]+)"/.exec(html);
  const photoUrl = photoM ? photoM[1].replace(/\\\//g, "/") : null;

  const verifiedM = /tm-badge-verified[^>]*>([^<]+)</.exec(html);
  const identityVerified = !!(verifiedM && verifiedM[1].includes("Identity"));

  const walletLabelM = /Linked Wallet.*?tm-settings-item-desc[^>]*>.*?<span class="short">([^<]+)<\/span>/s.exec(html);
  const walletLabel = walletLabelM ? walletLabelM[1].trim() : null;

  const walletVerified = /Linked Wallet.*?tm-badge-verified/s.test(html);

  let walletAddress: string | null = null;
  const addrM = /Wallet\.init\(\{[^}]*"address"\s*:\s*"([^"]+)"/.exec(html);
  if (addrM && addrM[1] !== "false") {
    walletAddress = addrM[1];
  }

  return {
    name,
    username,
    photoUrl,
    identityVerified,
    walletAddress,
    walletLabel,
    walletVerified,
  };
}

export function parseMyBids(html: string, itemType: string): [MyBid[], number] {
  const items: MyBid[] = [];

  let tabPattern: RegExp;
  if (itemType === "usernames") {
    tabPattern = /<a href="\/my\/bids"[^>]*>.*?Usernames.*?<span[^>]*>(\d+)<\/span>/s;
  } else {
    tabPattern = new RegExp(
      `<a href="/my/bids\\?type=${itemType}"[^>]*>.*?<span[^>]*>(\\d+)</span>`,
      "s"
    );
  }
  const tabMatch = tabPattern.exec(html);
  const totalCount = tabMatch ? parseInt(tabMatch[1], 10) : 0;

  const rows = matchAll(
    /<tr[^>]*class="[^"]*tm-row-selectable[^"]*"[^>]*>(.*?)<\/tr>/gs,
    html
  );

  for (const rowM of rows) {
    const row = rowM[1];
    let slug = "";
    let name = "";
    let imageUrl: string | null = null;
    let description: string | null = null;

    if (itemType === "usernames") {
      const hm = /href="\/(username\/[^"]+)"/.exec(row);
      slug = hm ? hm[1] : "";
      const nm = /<div class="table-cell-value tm-value">@([^<]+)<\/div>/.exec(row);
      name = nm ? `@${nm[1]}` : slug;
      const dm = /<div class="table-cell-desc tm-nowrap">([^<]+)<\/div>/.exec(row);
      description = dm ? dm[1].trim() : null;
    } else if (itemType === "gifts") {
      const hm = /href="(\/gift\/[^"]+)"/.exec(row);
      slug = hm ? hm[1] : "";
      const nm = /<div class="table-cell-value tm-value">([^<]+)<\/div>/.exec(row);
      name = nm ? nm[1].trim() : slug;
      const im = /<img src="([^"]+)"/.exec(row);
      imageUrl = im ? im[1] : null;
      const dm = /<div class="table-cell-desc tm-nowrap">([^<]+)<\/div>/.exec(row);
      description = dm ? dm[1].trim() : null;
    } else {
      const hm = /href="\/(number\/[^"]+)"/.exec(row);
      slug = hm ? hm[1] : "";
      const nm = /<div class="table-cell-value tm-value">\+?([^<]+)<\/div>/.exec(row);
      name = nm ? nm[1].trim() : slug;
    }

    const bidM = /icon-before\s+icon-ton[^>]*>\s*([0-9.]+)\s*</.exec(row);
    const bid = bidM ? parseFloat(bidM[1].trim()) : 0.0;

    const dateM = /datetime="([^"]+)"/.exec(row);
    const date = dateM ? dateM[1] : "";

    const statusM = /tm-status-([a-z]+)[^>]*>([^<]+)<\/div>/.exec(row);
    const status = statusM ? statusM[2].trim() : "Unknown";

    if (slug) {
      items.push({ itemType, slug, name, bid, status, date, imageUrl, description });
    }
  }

  return [items, totalCount];
}

export function parseMyAssets(html: string, itemType: string): [MyAsset[], number] {
  const items: MyAsset[] = [];

  let tabPattern: RegExp;
  if (itemType === "usernames") {
    tabPattern = /<a href="\/my\/usernames"[^>]*>.*?Usernames.*?<span[^>]*>(\d+)<\/span>/s;
  } else if (itemType === "gifts") {
    tabPattern = /<a href="\/my\/gifts"[^>]*>.*?Gifts.*?<span[^>]*>(\d+)<\/span>/s;
  } else {
    tabPattern = /<a href="\/my\/numbers"[^>]*>.*?(?:Collectible )?Numbers.*?<span[^>]*>(\d+)<\/span>/s;
  }
  const totalMatch = tabPattern.exec(html);
  const totalCount = totalMatch ? parseInt(totalMatch[1], 10) : 0;

  let tbodyM = /<tbody[^>]*class="[^"]*js-assets-table-body[^"]*"[^>]*>(.*?)<\/tbody>/s.exec(html);
  if (!tbodyM) tbodyM = /<tbody[^>]*>(.*?)<\/tbody>/s.exec(html);
  if (!tbodyM) return [items, totalCount];

  const rows = matchAll(
    /<tr[^>]*class="[^"]*tm-row-selectable[^"]*"[^>]*>(.*?)<\/tr>/gs,
    tbodyM[1]
  );

  for (const rowM of rows) {
    const row = rowM[1];
    let slug = "";
    let name = "";
    let imageUrl: string | null = null;
    let description: string | null = null;
    let assignedTo: string | null = null;
    let assignedName: string | null = null;

    if (itemType === "usernames") {
      const hm = /href="\/(username\/[^"]+)"/.exec(row);
      slug = hm ? hm[1] : "";
      const nm = /<div class="table-cell-value tm-value">@([^<]+)<\/div>/.exec(row);
      name = nm ? `@${nm[1]}` : slug;
      const am = /data-assigned-to="([^"]+)"/.exec(row);
      assignedTo = am ? am[1] : null;
    } else if (itemType === "gifts") {
      const hm = /href="(\/gift\/[^"?]+)/.exec(row);
      slug = hm ? hm[1].replace(/^\//, "") : "";
      const nm = /<div class="table-cell-value tm-value">([^<]+)<\/div>/.exec(row);
      name = nm ? nm[1].trim() : slug;
      const im = /<img src="([^"]+)"/.exec(row);
      imageUrl = im ? im[1] : null;
      const dm = /<div class="table-cell-desc tm-nowrap">([^<]+)<\/div>/.exec(row);
      description = dm ? dm[1].trim() : null;
      const am = /data-assigned-to="([^"]+)"/.exec(row);
      assignedTo = am ? am[1] : null;
      const anm = /<span class="js-assigned-to">([^<]+)<\/span>/.exec(row);
      assignedName = anm ? anm[1].trim() : "Wallet";
    } else {
      const hm = /href="\/(number\/[^"]+)"/.exec(row);
      slug = hm ? hm[1] : "";
      const nm = /<div class="table-cell-value tm-value">\+?([^<]+)<\/div>/.exec(row);
      name = nm ? nm[1].trim() : slug;
    }

    if (slug) {
      items.push({ itemType, slug, name, description, imageUrl, assignedTo, assignedName });
    }
  }

  return [items, totalCount];
}

export function parseAssignAccounts(html: string): [TelegramAccount[], boolean] {
  const accounts: TelegramAccount[] = [];
  let canDisable = false;

  const popupM = /<div[^>]*class="[^"]*popup-container[^"]*js-assign-popup[^"]*"[^>]*>(.*?)<\/div>\s*<\/div>\s*<\/div>/s.exec(html);
  if (!popupM) return [accounts, canDisable];

  const popupHtml = popupM[1];
  canDisable = /Don't display on Telegram/.test(popupHtml);

  const labelRe = /<label[^>]*class="[^"]*tm-assign-account-item[^"]*"[^>]*>(.*?)<\/label>/gs;
  for (const lm of matchAll(labelRe, popupHtml)) {
    const labelHtml = lm[1];
    const vm = /value="([^"]+)"/.exec(labelHtml);
    if (!vm) continue;
    const id = vm[1];
    const nm = /tm-assign-account-name">([^<]+)<\/div>/.exec(labelHtml);
    const name = nm ? nm[1].trim() : "Unknown";
    const tm = /tm-assign-account-desc">([^<]+)<\/div>/.exec(labelHtml);
    const type = tm ? tm[1].trim() : "Unknown";
    const im = /<img[^>]*src="([^"]+)"/.exec(labelHtml);
    const photoUrl = im ? im[1] : null;

    accounts.push({ id, name, type, photoUrl });
  }

  return [accounts, canDisable];
}

export function parseSessions(html: string): SessionInfo[] {
  const sessions: SessionInfo[] = [];
  const tbodyM = /<tbody[^>]*>(.*?)<\/tbody>/s.exec(html);
  if (!tbodyM) return sessions;

  const rowRe = /<tr>\s*(.*?)\s*<\/tr>/gs;
  for (const rm of matchAll(rowRe, tbodyM[1])) {
    const row = rm[1];
    if (row.includes("<th")) continue;

    const deviceM = /table-cell-value\s+tm-value[^"]*"[^>]*>\s*([^<]+?)\s*</.exec(row);
    const device = deviceM ? deviceM[1].trim() : "";

    const locRe = /table-cell-desc-col\s+tm-nowrap[^"]*"[^>]*>\s*([^<]+?)\s*</g;
    const locations: string[] = [];
    for (const lm of matchAll(locRe, row)) {
      const val = lm[1].trim();
      if (val && !val.startsWith("now") && !val.includes("at ")) {
        locations.push(val);
      }
    }
    const location = locations[0] || "";

    const sidM = /data-session-id="([^"]+)"/.exec(row);
    const sessionId = sidM ? sidM[1] : "";

    const isCurrent = /tm-status-avail[^>]*>Current</.test(row);

    const dateM = /<time[^>]+datetime="([^"]+)"/.exec(row);
    const date = dateM ? dateM[1] : isCurrent ? "now" : null;

    if (device || sessionId) {
      sessions.push({ sessionId, device, location, date, isCurrent });
    }
  }
  return sessions;
}

export function parseLoginCode(html: string): [string | null, number] {
  const m = /class="[^"]*table-cell-value[^"]*"[^>]*>([^<]+)</.exec(html);
  const code = m ? m[1].trim() : null;
  const activeSessions = (html.match(/<tr[\s>]/g) || []).length;
  return [code, activeSessions];
}