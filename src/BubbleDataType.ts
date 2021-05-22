import axios, { AxiosResponse } from "../node_modules/axios/index";
import BubbleConfig from "./BubbleConfig";
import { BaseDataType, SearchConfig } from "./types/search";
import {
  CreateResponse,
  GetByIDResponse,
  SearchResponse,
} from "./types/responses";

export default abstract class BubbleDataType implements BaseDataType {
  "Created Date": string;
  "Created By": string;
  "Modified Date": string;
  _id: string;

  /** The name of the type as it appears in the URL path for requests */
  abstract type: string;

  constructor(args: Record<string, unknown>) {
    Object.assign(this, args);
  }

  /** Get an object by ID. */
  static async getByID<T extends BubbleDataType>(
    this: CustomDataClass<T>,
    id: string
  ): Promise<T> {
    const { objectUrl, headers } = new this({});
    const res: AxiosResponse<GetByIDResponse> = await axios.get(
      `${objectUrl}/${id}`,
      { headers }
    );
    if (!res.data) throw new Error(`Unexpected response from bubble: no body`);
    return new this(res.data.response);
  }

  /** Create a new object in Bubble, returning the ID */
  static async create<T extends BubbleDataType>(
    this: CustomDataClass<T>,
    data: CustomFields<T>
  ): Promise<string> {
    const { objectUrl, headers } = new this({});
    const res: AxiosResponse<CreateResponse> = await axios.post(
      `${objectUrl}/`,
      data,
      { headers }
    );
    if (!res.data) throw new Error(`Unexpected response from bubble: no body`);
    if (res.data.status !== "success" || !res.data.id) {
      throw new Error(`create request failed with status: ${res.data.status}`);
    }
    return res.data.id;
  }

  /** Search all objects of the type */
  static async search<T extends BubbleDataType>(
    this: CustomDataClass<T>,
    config: SearchConfig<T> = {}
  ): Promise<SearchResponse<T>["response"]> {
    const { objectUrl, headers } = new this({});
    const res: AxiosResponse<SearchResponse<T>> = await axios.get(objectUrl, {
      headers,
      params: {
        constraints: JSON.stringify(config.constraints || []),
        sort_field: config.sort?.sort_field,
        descending: config.sort?.descending ? "true" : false,
        cursor: config.cursor,
      },
    });
    if (!res.data?.response) {
      throw new Error("search request failed");
    }
    return res.data.response;
  }

  /** Page through all bubble API results to get all objects matching constraints */
  static async getAll<T extends BubbleDataType>(
    this: CustomDataClass<T>,
    config: Omit<SearchConfig<T>, "cursor">
  ): Promise<T[]> {
    let cursor = 0;
    let results: T[] = [];
    while (true) {
      // @ts-expect-error
      const res = await (this as typeof T).search({
        ...config,
        cursor,
      });
      results = results.concat(res.results);
      if (res.remaining <= 0) break;
      cursor++;
    }
    return results;
  }

  /** Get the first instance matching the search query. */
  static async getOne<T extends BubbleDataType>(
    this: CustomDataClass<T>,
    config: Omit<SearchConfig<T>, "cursor">
  ): Promise<T | null> {
    // @ts-expect-error
    const searchResults = await this.search<T>(config);
    return searchResults.response.results[0] || null;
  }

  async save(): Promise<void> {
    const { objectUrl, headers } = this;
    if (!this._id) {
      throw new Error(
        "Cannot call save on a BubbleDataType without an _id value."
      );
    }
    await axios.patch(`${objectUrl}/${this._id}`, Object.assign({}, this), {
      headers,
    });
  }

  private get headers() {
    const { apiKey } = BubbleConfig.get();
    return {
      Authorization: `Bearer ${apiKey}`,
    };
  }

  private get objectUrl(): string {
    const { app, appVersion } = BubbleConfig.get();
    const versionPart = appVersion ? `/${appVersion}` : "";
    return `https://${app}.bubbleapps.io${versionPart}/api/1.1/obj/${this.type}`;
  }
}

type CustomDataClass<T extends BubbleDataType> = new (args: Partial<T>) => T;

type CustomFields<T extends BubbleDataType> = Omit<T, keyof BubbleDataType>;