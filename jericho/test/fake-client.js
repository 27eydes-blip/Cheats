// A stand-in for the Anthropic client. `script` is a list of responses for the brain's
// streamed requests; `route(req)` can answer other requests (screens, call agent, style).
export function fakeClient(script = [], route = () => null) {
  const calls = [];
  const answer = (req) => {
    calls.push(structuredClone(req));
    const routed = route(req);
    if (routed) return routed;
    const next = script.shift();
    if (!next) throw new Error(`fake client: nothing scripted for ${req.model}`);
    return typeof next === "function" ? next(req) : next;
  };
  return {
    calls,
    models: { list: async () => ({ data: [] }) },
    beta: {
      messages: {
        async create(req) {
          return { model: req.model, ...answer(req) };
        },
        stream(req) {
          const handlers = {};
          let response;
          let error;
          try {
            response = answer(req);
          } catch (e) {
            error = e;
          }
          return {
            on(event, cb) {
              (handlers[event] ||= []).push(cb);
              return this;
            },
            async finalMessage() {
              if (error) throw error;
              for (const block of response.content) {
                if (block.type !== "text") continue;
                // Deliver the text in small pieces, like a real stream.
                for (const piece of block.text.match(/[\s\S]{1,6}/g) || []) for (const cb of handlers.text || []) cb(piece);
              }
              return { model: req.model, ...response };
            },
          };
        },
      },
    },
  };
}

export const say = (text) => ({ stop_reason: "end_turn", content: [{ type: "text", text }] });
export const use = (id, name, input) => ({ stop_reason: "tool_use", content: [{ type: "tool_use", id, name, input }] });
export const json = (obj) => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }] });
