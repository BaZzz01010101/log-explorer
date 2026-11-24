import type {
  LogGroup,
  LogStream,
  Page,
  QueryRequest,
  QueryUpdate,
} from "../shared/contracts";

/** One provider connection: its resources, history and Live stream. */
export interface LogAdapter {
  listGroups(
    prefix: string,
    cursor: string | undefined,
    signal: AbortSignal,
  ): Promise<Page<LogGroup>>;
  listStreams(
    group: string,
    prefix: string,
    cursor: string | undefined,
    signal: AbortSignal,
  ): Promise<Page<LogStream>>;
  events(request: QueryRequest, signal: AbortSignal): Promise<QueryUpdate>;
  live(
    request: QueryRequest,
    signal: AbortSignal,
    emit: (update: QueryUpdate) => void,
  ): Promise<void>;
  destroy(): void;
}
