# AWS integration

## Authorization and credentials

A first launch starts with AWS disabled. In packaged applications, **Workspace settings → Connections → Enable AWS access** remembers the explicit choice across restarts in a separate local application preference. Enabling access refreshes Explorer and retries affected AWS log views. Workspace imports cannot change this preference. Development, unpackaged applications and offline/background verification ignore it and reject enable attempts. Keep every build used for development or verification offline.

Only the Electron main process imports the official AWS SDK, constructs clients, resolves credentials and sends requests. A gate is checked before provider/client construction and before dispatch; metadata cache hits also require authorization. The renderer receives serializable log data through a narrow, validated preload bridge. Workspaces contain profile names and regions, never keys, SSO tokens or event payloads.

Connections use the SDK `fromIni` provider for an existing named profile, including supported role-assumption and IAM Identity Center/SSO profiles. Establish and refresh your SSO session outside this application. There is no embedded SSO login, MFA prompt or credential editor. Provider failures surface as authentication errors. No configured profiles, sessions or credentials were inspected during implementation or verification.

## Operations

| User operation                      | AWS API                                      | Behavior                                                                 |
| ----------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------ |
| Browse log groups                   | `DescribeLogGroups`                          | Case-sensitive substring search, lazy pages and bounded metadata cache   |
| Browse streams                      | `DescribeLogStreams`                         | Newest-first lazy pages; automatic scroll continuation                   |
| Fetch events or surrounding context | `FilterLogEvents`                            | Exact stream selection, event-time bounds and server filter pattern      |
| Analyze logs                        | `StartQuery`, `GetQueryResults`, `StopQuery` | CWLI only; partial snapshots, polling, scan statistics and cancellation  |
| Monitor new events                  | `StartLiveTail`                              | Consume the actual SDK event stream; report sampling and stream failures |

Group-name search matches text anywhere in the name through the server's `logGroupNamePattern`; entering `orders` can find `/aws/lambda/orders-api`. It searches AWS results, including later matching pages, rather than filtering only the groups already loaded in the sidebar. The API is case-sensitive. Pattern responses omit retention, class and storage metadata, so the adapter retrieves each matching page's exact names with `logGroupIdentifiers` before displaying those details. The search continuation remains separate from that bounded metadata hydration. Empty search text uses the normal unfiltered listing. [AWS DescribeLogGroups documentation](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/command/DescribeLogGroupsCommand).

Historical event continuation keeps independent tokens for selected groups. `FilterLogEvents` can return an empty page with a continuation even when the requested range contains events; the adapter automatically follows up to 32 pages per source in one fetch, stopping once it finds events or reaches the end. If that scan budget ends first, scrolling resumes the remaining continuation. Repeated/cyclic tokens and continuation-history bounds terminate visibly. Continuations are process-local, expire after 15 minutes and cannot be reused with a different query. Fetches return at most 10,000 events. Event views combine up to 50 distinct log groups across configured connections and regions, retaining source identity. Insights and Live Tail require one connection and region.

Insights returns at most the requested limit, capped at 10,000 rows. Aggregations remain structured result rows, including field names and values. Polling is bounded to approximately one hour; the client attempts `StopQuery` on cancellation or polling failure. Further Insights result pagination is not exposed. Truncation is shown; narrow the query or time range when necessary. A failed stop is surfaced because the server query might still be running.

Live Tail accepts up to 10 Standard-class groups. Stream selection is allowed only with a single group. The SDK supplies its service endpoint; the application does not replace streaming with repeated event polling. Sampling, service timeouts and stream errors are visible. Cancelling closes the stream. CloudWatch may sample high-volume sessions, so Live Tail is not a complete event archive. [AWS Live Tail documentation](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CloudWatchLogs_LiveTail.html).

Live receives only new matching events; historical time windows do not constrain the stream. Starting Live retains matching loaded history, with a separate new-session count. Empty session updates confirm a connected stream and do not show a historical loader. Follow Live controls scrolling independently of reception. Stop, errors and normal stream completion remain stopped until an explicit restart or historical query, even with historical auto-refresh enabled. A stream that produces no protocol updates for 30 seconds is aborted and offers Retry Live. Complete service batches reach the bounded renderer buffer, which retains the newest events. Time presets, Run and query mode changes stop Live and load historical results.

The adapter limits concurrent requests and retries throttling/transient failures with bounded backoff. Ambiguous `StartQuery` failures are not automatically retried as a new query. Local buffers are bounded by preferences and report event eviction.

## Permissions

These are the CloudWatch Logs IAM actions used by the implemented operations:

| Capability                              | Actions                                                     |
| --------------------------------------- | ----------------------------------------------------------- |
| Resource navigation                     | `logs:DescribeLogGroups`, `logs:DescribeLogStreams`         |
| Event selection and context             | `logs:FilterLogEvents`                                      |
| Insights execution/results/cancellation | `logs:StartQuery`, `logs:GetQueryResults`, `logs:StopQuery` |
| Live monitoring                         | `logs:StartLiveTail`                                        |

Scope policies to the intended existing log groups where supported. Group discovery and query stopping use actions whose resource scope may require `*`; consult the current [CloudWatch Logs service authorization reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_logs.html) and [permissions reference](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/permissions-reference-cwl.html). Profile authentication may require the existing role/SSO permissions configured for that profile.

The application does not provision infrastructure, ingest logs, change retention, create export tasks or modify IAM policies. Export writes the loaded selection to a local file. Unmasking protected log data is not implemented. Stream cancellation closes the client stream; no separate AWS resource-management operation is used.

Insights scan costs and Live Tail session charges apply when using AWS. Review time ranges and automatic refresh before running queries. [AWS Insights guidance](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/AnalyzingLogData.html), [AWS Live Tail guidance](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CloudWatchLogs_LiveTail.html).

## Verification boundary

All AWS adapter tests use injected command transports and fixture responses under network isolation. No real AWS request was executed. Actual profile/SSO interoperability, IAM policies, network/proxy environments, service endpoint behavior and account-specific quotas remain unverified against AWS.
