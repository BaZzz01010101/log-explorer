import type { LogEvent } from "../shared/contracts";
import {
  LOCAL_FILTER_REGEX_LIMIT,
  MESSAGE_LIMIT,
  matchesLocalFilter,
  parseLogMessage,
  type LocalFilterOptions,
} from "../shared/log-data";

self.onmessage = ({
  data,
}: MessageEvent<{
  jobId: number;
  events: LogEvent[];
  query: string;
  level: string | readonly string[];
  options: LocalFilterOptions;
}>) => {
  const { jobId, events, query, level, options } = data;
  self.postMessage({ jobId, ready: true });
  try {
    if (query.length > LOCAL_FILTER_REGEX_LIMIT)
      throw new Error(
        `Local filter regex exceeds the ${LOCAL_FILTER_REGEX_LIMIT}-character limit`,
      );
    try {
      new RegExp(query, options.caseSensitive ? "u" : "iu");
    } catch {
      throw new Error("Invalid local filter regex. Edit the pattern to retry.");
    }
    if (events.some((event) => event.message.length > MESSAGE_LIMIT))
      throw new Error(
        `Local filter regex message limit is ${MESSAGE_LIMIT} characters. Use plain filtering for larger messages.`,
      );
    const batch = events.map((event) => ({
      id: event.id,
      matched: matchesLocalFilter(
        event,
        parseLogMessage(event.message),
        query,
        level,
        { ...options, regex: true },
      ),
    }));
    self.postMessage({ jobId, batch, done: true });
  } catch (error) {
    self.postMessage({
      jobId,
      error:
        error instanceof Error
          ? error.message
          : "Local regex filtering is unavailable",
      done: true,
    });
  }
};
