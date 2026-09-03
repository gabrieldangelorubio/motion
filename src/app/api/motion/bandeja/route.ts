/* -----------------------------------------------------------------------------
   Route handler de la BANDEJA DE ENTRADA — /api/motion/bandeja

   POST  cuerpo = el JSON del plugin tal cual (o {nombre?, origen?, json})
         → deja la entrada y responde {ok, entrada}; 413 si pesa más que
         el tope de la bandeja (el body se acota ANTES de leerlo entero)
   GET   → {ok, entradas} (sin contenidos)
   GET ?id=… → el JSON de esa entrada SIN sacarla (peek): el panel la
         descarta con DELETE solo cuando la analizó bien — si algo falla
         entre medio, la entrada sigue ahí
   DELETE ?id=… → la descarta

   Buzón en MEMORIA del proceso (andamiaje, como el almacén de
   composiciones): en dev alcanza para que el agente que corrió use_figma
   deje el JSON y el editor lo levante. El actor es andamiaje; diosa lo
   cablea a la sesión y decide dónde persiste.
----------------------------------------------------------------------------- */

import type { Actor } from "@/lib/motion/modelo";
import {
  TOPE_CARACTERES,
  cabeEnBandeja,
  crearBandeja,
  dejarEnBandeja,
  listarBandeja,
  pareceExportDelPlugin,
  tomarDeBandeja,
  type Bandeja,
} from "@/lib/motion/bandeja-puro";

export const dynamic = "force-dynamic";

// ANDAMIAJE: en diosa, el actor sale de la sesión y sin sesión se responde
// 403 ANTES de leer el body. Acá es un actor fijo: el endpoint queda abierto
// en dev (igual que el resto del módulo en este repo), con el tope de tamaño
// como único freno.
async function actorDeSesion(): Promise<Actor | null> {
  return { id: "dev-local", rol: "admin", email: "dev@local" };
}

/** Lee el body con tope: corta el stream al pasar `maximo` (no confía solo
    en content-length, que puede faltar o mentir). null = demasiado grande. */
async function leerConTope(pedido: Request, maximo: number): Promise<string | null> {
  const declarado = Number(pedido.headers.get("content-length") ?? "0");
  if (declarado > maximo) return null;
  if (!pedido.body) return await pedido.text();
  const lector = pedido.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximo) {
      await lector.cancel();
      return null;
    }
    partes.push(value);
  }
  const junto = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    junto.set(p, pos);
    pos += p.byteLength;
  }
  return new TextDecoder().decode(junto);
}

// el buzón vive en el módulo (sobrevive entre pedidos del mismo proceso);
// globalThis para que el hot reload del dev server no lo vacíe
const g = globalThis as unknown as { __motionBandeja?: Bandeja };
function bandeja(): Bandeja {
  if (!g.__motionBandeja) g.__motionBandeja = crearBandeja();
  return g.__motionBandeja;
}

export async function POST(pedido: Request): Promise<Response> {
  const actor = await actorDeSesion();
  if (!actor) return Response.json({ ok: false, error: "sin sesión" }, { status: 403 });
  // el sobre {json} puede venir escapado (~+10 %): el tope del body es el de
  // la bandeja con ese margen; el contenido real se vuelve a medir después
  const crudo = await leerConTope(pedido, Math.floor(TOPE_CARACTERES * 1.15));
  if (crudo === null) return Response.json({ ok: false, error: `el cuerpo pesa más que el tope de la bandeja (${TOPE_CARACTERES} caracteres)` }, { status: 413 });
  let datos: unknown;
  try {
    datos = JSON.parse(crudo);
  } catch {
    return Response.json({ ok: false, error: "El body no es JSON" }, { status: 400 });
  }
  // sobre: {nombre, origen, json} con el export adentro (string u objeto)
  let contenido = crudo;
  let origen: string | undefined;
  let nombreDado: string | undefined;
  const sobre = datos as { json?: unknown; origen?: unknown; nombre?: unknown };
  if (sobre && typeof sobre === "object" && "json" in sobre && sobre.json !== undefined) {
    if (typeof sobre.origen === "string") origen = sobre.origen;
    if (typeof sobre.nombre === "string") nombreDado = sobre.nombre;
    if (typeof sobre.json === "string") {
      contenido = sobre.json;
      try {
        datos = JSON.parse(contenido);
      } catch {
        return Response.json({ ok: false, error: "El campo json no es un JSON válido" }, { status: 400 });
      }
    } else {
      datos = sobre.json;
      contenido = JSON.stringify(sobre.json);
    }
  }
  const forma = pareceExportDelPlugin(datos);
  if (!forma.ok) return Response.json({ ok: false, error: forma.error }, { status: 400 });
  if (!cabeEnBandeja(contenido.length)) return Response.json({ ok: false, error: `el export pesa ${contenido.length} caracteres: el tope es ${TOPE_CARACTERES}` }, { status: 413 });
  const { bandeja: nueva, entrada } = dejarEnBandeja(bandeja(), contenido, nombreDado ?? forma.nombre, Date.now(), origen);
  g.__motionBandeja = nueva;
  return Response.json({ ok: true, entrada });
}

export async function GET(pedido: Request): Promise<Response> {
  const id = new URL(pedido.url).searchParams.get("id");
  if (!id) return Response.json({ ok: true, entradas: listarBandeja(bandeja()) });
  const contenido = bandeja().contenidos.get(id);
  if (contenido === undefined) return Response.json({ ok: false, error: "esa entrada ya no está en la bandeja" }, { status: 404 });
  return new Response(contenido, { status: 200, headers: { "content-type": "application/json; charset=utf-8" } });
}

export async function DELETE(pedido: Request): Promise<Response> {
  const id = new URL(pedido.url).searchParams.get("id");
  if (!id) return Response.json({ ok: false, error: "Falta id" }, { status: 400 });
  const tomada = tomarDeBandeja(bandeja(), id);
  if (tomada) g.__motionBandeja = tomada.bandeja;
  return Response.json({ ok: true, habia: !!tomada });
}
