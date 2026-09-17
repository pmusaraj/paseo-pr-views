import type { SearchPage } from "../../shared/saved-views";
import { Cache } from "../cache/cache";

export const searchCache = new Cache<SearchPage>("pr-search-reviews-v1");
