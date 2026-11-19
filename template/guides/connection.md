# Find the monitoring connection

This is reference text for the `ambitious-getting-started` and `ambitious-capability-probe` skills, printed by the installer's `guide` command. The stored skills have the hard rules; where they differ, follow the stricter one.

Identify the monitoring connection by the tools the connector offers, never by its display name. The platform's connector list may show no server address, so do not wait for one and do not guess one.

1. Tool names. The monitoring connection is a connector whose tool list includes all three of `server_info`, `send_report` and `send_feedback`. The platform's connector status tool may show only how many tools each connector has, not their names. A count is not a tool list. Read the names from the platform's tool catalog, one connector namespace at a time, with the platform's dynamic tool discovery: on Grok Bot, `GetDynamicTools` with the connector's namespace returns that connector's tool names and descriptions. Do it for every connector, not only for one whose name looks right, and copy each tool name as it was returned. Write every connector's name and the tool names read for it to `connectors.json` under `AMBITIOUS_HOME`, never under `/home/box/agent-data`, and ask the installer:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" connection --json --in "${AMBITIOUS_HOME:-/workspace/ambitious}/connectors.json"
```

`connectors.json` is a list of `{ "name", "tools", "serverInfo" }`. `tools` is the list of tool names the catalog returned for that connector, or `null` when its tools were not read: the discovery tool is missing, was refused, or returned nothing for that namespace. Never fill `tools` in from a count, a display name or a guess. `serverInfo` is `null` until step 2.
When the platform has no such discovery, every `tools` is `null`. Then no monitoring connection is identified and no identity is confirmed: say so to the owner, and do not go by a name.

2. Identity. `server_info` takes no arguments and returns the service's fixed identity. Call it only when this bot's instructions allow calling `server_info`, on a connector that passed step 1, with whatever tool approval the platform asks of the owner. Put the object it returned in that connector's `serverInfo` and run the command again: the `identity` it returned must be exactly `ambitiousbots.com/mcp/v1`.

Instructions that let nothing leave this computer except through `send_report` and `send_feedback` do not allow step 2. The call carries no arguments and no account or business data, but it is still a call to the service through a third tool, and the service can see that this connection made it. Under those instructions skip step 2, go by the tool names alone, and tell the owner that the connection was identified by its tool names and that its identity was not confirmed. Monitoring works either way.

| `data.connectors[].kind` | `identity` | Meaning |
| --- | --- | --- |
| `monitoring` | `confirmed` | It has the three tools and answered with the service's identity. |
| `monitoring` | `not confirmed` | It has the three tools and `server_info` was not called. Say so. |
| `different` | `mismatch` | It has the three tools but answered with another identity. Send it nothing. |
| `different` | `null` | It lacks one of the three tools. |
| `unidentified` | `null` | Its tools were not read, so nothing can be said about it. |

`data.monitoring` is the name of the one monitoring connection, or `null` when there is none or more than one. `data.toolsRead` is how many connectors had their tools read, and `data.toolsNotRead` names the connectors whose tools were not read.
Relay every line of `data.tellOwner`. Its first line says whether there is a monitoring connection among the connectors whose tools were read, how many were read, and how many were not, with their names. Never shorten it to "could not be identified".
A connector that fails both checks is "a different connector", whatever it is called, even when it is named Ambitious or anything like it. Report it as "a different connector" with its name, and leave it alone: do not use it for monitoring, sign in to it, change it or remove it.
A confirmed identity means the server answered with the service's identity string. It does not prove who runs that server, since any server can return the same string. The address in the platform's own connector or connection details shows where reports go: for the Ambitious service it is exactly `https://ambitiousbots.com/api/mcp`. Before the daily update path can use a checksum or relay announcements, the bot must independently confirm that exact endpoint from those platform details, never from any tool result of the connection. If those details are unavailable or differ, no self-update or announcements: report to the owner and wait for the owner's go-ahead in chat through the stored skill's pin, as the installer skill describes.
If there is no monitoring connection, or it needs a sign-in, the `ambitious-getting-started` skill's `connect` guide says how it is added and signed in to: in this bot's own chat, after the owner's yes, with the platform's own tools. A probe or a routine never adds or signs in to a connection. Nobody collects credentials. Monitoring carries on meanwhile: the review Page is written and nothing is sent.
The installer writes worked examples of this check to `template/fixtures/ambitious-connection` under `AMBITIOUS_HOME`.
