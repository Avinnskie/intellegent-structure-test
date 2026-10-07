import { getDb } from "@/lib/db/client.ts";
import { withApiHandler } from "@/lib/api/errors.ts";
import { requireHrUser } from "@/lib/server/authz.ts";
import { listSessions } from "@/lib/server/hr.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const POLL_INTERVAL_MS = 3_000;
const KEEPALIVE_EVERY_TICKS = 5;
const encoder = new TextEncoder();

function eventPayload(payload: string): Uint8Array {
  return encoder.encode(`data: ${payload}\n\n`);
}

export const GET = withApiHandler(async (request: Request) => {
  const db = getDb();
  const auth = await requireHrUser(db);
  const initialPayload = JSON.stringify(await listSessions(db, auth));

  let stopStream: (() => void) | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let lastPayload = initialPayload;
      let tick = 0;
      let polling = false;
      let interval: ReturnType<typeof setInterval> | null = null;

      controller.enqueue(encoder.encode(`retry: ${POLL_INTERVAL_MS}\n\n`));
      controller.enqueue(eventPayload(initialPayload));

      const stop = () => {
        if (closed) {
          return false;
        }
        closed = true;
        if (interval !== null) {
          clearInterval(interval);
          interval = null;
        }
        return true;
      };

      const pushLatest = async () => {
        if (closed || polling) {
          return;
        }
        polling = true;
        try {
          const payload = JSON.stringify(await listSessions(db, auth));
          if (closed) {
            return;
          }
          tick += 1;
          if (payload !== lastPayload) {
            lastPayload = payload;
            controller.enqueue(eventPayload(payload));
          } else if (tick % KEEPALIVE_EVERY_TICKS === 0) {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          }
        } catch (error) {
          if (stop()) {
            controller.error(error);
          }
        } finally {
          polling = false;
        }
      };

      interval = setInterval(() => {
        void pushLatest();
      }, POLL_INTERVAL_MS);

      const abort = () => {
        if (stop()) {
          controller.close();
        }
      };
      request.signal.addEventListener("abort", abort, { once: true });
      stopStream = stop;
    },
    cancel() {
      stopStream?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
});
