import { test } from "node:test";
import assert from "node:assert/strict";
import { DELETE, GET, POST } from "@/app/api/motion/bandeja/route";
import { TOPE_CARACTERES } from "@/lib/motion/bandeja-puro";

const EXPORT = { origen: "figma", version: 1, plugin: 22, frame: { nombre: "Frame 16163", ancho: 838, alto: 405 }, nodos: [{ tipo: "texto" }] };
const g = globalThis as unknown as { __motionBandeja?: unknown };
const pedido = (metodo: string, cuerpo?: string, query = "") =>
  new Request(`http://local/api/motion/bandeja${query}`, { method: metodo, body: cuerpo, headers: cuerpo ? { "content-type": "application/json" } : undefined });

test("route: POST con el export crudo y con sobre {json}; GET lista; GET ?id es un PEEK; DELETE saca", async () => {
  g.__motionBandeja = undefined;
  const crudo = await POST(pedido("POST", JSON.stringify(EXPORT)));
  assert.equal(crudo.status, 200);
  const e1 = ((await crudo.json()) as { entrada: { id: string; nombre: string } }).entrada;
  assert.equal(e1.nombre, "Frame 16163");
  const sobre = await POST(pedido("POST", JSON.stringify({ nombre: "botón", origen: "use_figma", json: JSON.stringify(EXPORT) })));
  const e2 = ((await sobre.json()) as { entrada: { id: string; nombre: string; origen: string } }).entrada;
  assert.equal(e2.nombre, "botón");
  assert.equal(e2.origen, "use_figma");
  // sobre con el export como OBJETO: se re-serializa, pero es el mismo export
  const sobreObj = await POST(pedido("POST", JSON.stringify({ json: EXPORT })));
  assert.equal(sobreObj.status, 200);
  const lista = (await (await GET(pedido("GET"))).json()) as { entradas: { id: string }[] };
  assert.equal(lista.entradas.length, 3);
  // peek: el contenido vuelve tal cual y la entrada SIGUE
  const peek = await GET(pedido("GET", undefined, `?id=${e1.id}`));
  assert.equal(peek.status, 200);
  assert.equal(await peek.text(), JSON.stringify(EXPORT));
  assert.equal(((await (await GET(pedido("GET"))).json()) as { entradas: unknown[] }).entradas.length, 3);
  // DELETE la saca; el segundo DELETE dice que ya no estaba; el peek da 404
  assert.deepEqual(await (await DELETE(pedido("DELETE", undefined, `?id=${e1.id}`))).json(), { ok: true, habia: true });
  assert.deepEqual(await (await DELETE(pedido("DELETE", undefined, `?id=${e1.id}`))).json(), { ok: true, habia: false });
  assert.equal((await GET(pedido("GET", undefined, `?id=${e1.id}`))).status, 404);
});

test("route: rechaza lo que no es export del plugin, lo que no es JSON y lo que pesa más que el tope (413 sin leer todo)", async () => {
  g.__motionBandeja = undefined;
  assert.equal((await POST(pedido("POST", JSON.stringify({ guion: [], pasos: [] })))).status, 400);
  assert.equal((await POST(pedido("POST", "{no json"))).status, 400);
  assert.equal((await POST(pedido("POST", JSON.stringify({ json: "{no json" })))).status, 400);
  // content-length por encima del tope: 413 antes de leer
  const gigante = new Request("http://local/api/motion/bandeja", {
    method: "POST",
    body: "{}",
    headers: { "content-type": "application/json", "content-length": String(TOPE_CARACTERES * 2) },
  });
  assert.equal((await POST(gigante)).status, 413);
  // sin content-length (stream) y con más bytes que el tope: también 413, cortando el stream
  const relleno = "x".repeat(1_000_000);
  let enviados = 0;
  const cuerpo = new ReadableStream<Uint8Array>({
    pull(controlador) {
      if (enviados > TOPE_CARACTERES * 1.2) {
        controlador.close();
        return;
      }
      controlador.enqueue(new TextEncoder().encode(relleno));
      enviados += relleno.length;
    },
  });
  const streaming = new Request("http://local/api/motion/bandeja", { method: "POST", body: cuerpo, headers: { "content-type": "application/json" }, duplex: "half" } as RequestInit);
  assert.equal((await POST(streaming)).status, 413);
  assert.ok(enviados < TOPE_CARACTERES * 1.2, `cortó a los ${enviados} bytes`);
  assert.equal(((await (await GET(pedido("GET"))).json()) as { entradas: unknown[] }).entradas.length, 0);
});
