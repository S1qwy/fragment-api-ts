import { FragmentClient } from "../client";
import {
  FragmentAPIError,
  FragmentError,
  UnexpectedError,
  fmt,
} from "../exceptions";
import {
  FRAGMENT_BASE_URL,
  GIFTS_PAGE,
  NUMBERS_PAGE,
} from "../types/constants";
import { GiftsResult, NumbersResult, UsernamesResult } from "../types/results";
import { parseAuctionRows, parseGiftItems } from "../utils/html";
import { buildHeaders, fetchFragmentHash, postFragmentApi } from "../utils/http";

function buildSearchData(
  query: string,
  itemType: string,
  sort?: string | null,
  filter?: string | null,
  offsetId?: string | null
): Record<string, any> {
  const data: Record<string, any> = {
    method: "searchAuctions",
    type: itemType,
    query,
  };
  if (sort != null) data.sort = sort;
  if (filter != null) data.filter = filter;
  if (offsetId != null) data.offset_id = offsetId;
  return data;
}

/**
 * Search Fragment marketplace for Telegram usernames.
 */
export async function searchUsernames(
  client: FragmentClient,
  query: string = "",
  sort?: string | null,
  filter?: string | null,
  offsetId?: string | null
): Promise<UsernamesResult> {
  try {
    const headers = buildHeaders(FRAGMENT_BASE_URL);
    const data = buildSearchData(query, "usernames", sort, filter, offsetId);

    const fragmentHash = await fetchFragmentHash(
      client.cookies,
      headers,
      FRAGMENT_BASE_URL,
      client.timeout
    );
    const result = await postFragmentApi(
      client.cookies,
      fragmentHash,
      headers,
      data,
      client.timeout
    );

    if (result.error) throw new FragmentAPIError(result.error);

    const items = parseAuctionRows(result.html || "");
    const rawNoi = result.next_offset_id;
    const nextOid = rawNoi ? String(rawNoi) : null;

    return { items, nextOffsetId: nextOid };
  } catch (exc) {
    if (exc instanceof FragmentError) throw exc;
    throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
  }
}

/**
 * Search Fragment marketplace for anonymous Telegram numbers.
 */
export async function searchNumbers(
  client: FragmentClient,
  query: string = "",
  sort?: string | null,
  filter?: string | null,
  offsetId?: string | null
): Promise<NumbersResult> {
  try {
    const headers = buildHeaders(NUMBERS_PAGE);
    const data = buildSearchData(query, "numbers", sort, filter, offsetId);

    const fragmentHash = await fetchFragmentHash(
      client.cookies,
      headers,
      NUMBERS_PAGE,
      client.timeout
    );
    const result = await postFragmentApi(
      client.cookies,
      fragmentHash,
      headers,
      data,
      client.timeout
    );

    if (result.error) throw new FragmentAPIError(result.error);

    const items = parseAuctionRows(result.html || "");
    const rawNoi = result.next_offset_id;
    const nextOid = rawNoi ? String(rawNoi) : null;

    return { items, nextOffsetId: nextOid };
  } catch (exc) {
    if (exc instanceof FragmentError) throw exc;
    throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
  }
}

/**
 * Search Fragment gifts marketplace.
 */
export async function searchGifts(
  client: FragmentClient,
  query: string = "",
  collection?: string | null,
  sort?: string | null,
  filter?: string | null,
  view?: string | null,
  attr?: Record<string, string[]> | null,
  offset?: number | null
): Promise<GiftsResult> {
  const data: Record<string, any> = {
    method: "searchAuctions",
    type: "gifts",
    query,
  };
  if (collection != null) data.collection = collection;
  if (sort != null) data.sort = sort;
  if (filter != null) data.filter = filter;
  if (view != null) data.view = view;
  if (attr != null) {
    for (const [trait, values] of Object.entries(attr)) {
      data[`attr[${trait}]`] = values;
    }
  }
  if (offset != null) data.offset = offset;

  try {
    const headers = buildHeaders(GIFTS_PAGE);

    const fragmentHash = await fetchFragmentHash(
      client.cookies,
      headers,
      GIFTS_PAGE,
      client.timeout
    );
    const result = await postFragmentApi(
      client.cookies,
      fragmentHash,
      headers,
      data,
      client.timeout
    );

    if (result.error) throw new FragmentAPIError(result.error);

    const [items, nextOffset] = parseGiftItems(result.html || "");

    return { items, nextOffset };
  } catch (exc) {
    if (exc instanceof FragmentError) throw exc;
    throw new UnexpectedError(fmt(UnexpectedError.UNEXPECTED, { exc: String(exc) }));
  }
}