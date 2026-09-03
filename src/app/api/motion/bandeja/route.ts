/* -----------------------------------------------------------------------------
   Route handler de la BANDEJA DE ENTRADA — /api/motion/bandeja

   POST  cuerpo = el JSON del plugin tal cual (o {nombre?, origen?, json})
         → deja la entrada y responde {ok, entrada}
   GET   → {ok, entradas} (sin contenidos)
   GET ?id=… → el JSON de esa entrada (se saca de la bandeja al entregarlo)
   DELETE ?id=… → la descarta

   Buzón en MEMORIA del proceso (andamiaje, como el almacén de
   composiciones): en dev alcanza para que el agente que corrió use_figma
   deje el JSON y el editor lo levante. El actor es andamiaje; diosa lo
   cablea a la sesión y decide dónde persiste.
----------------------------------------------------------------------------- */

import type { Actor } from "@/lib/motion/modelo";
import {
  crearBandeja,
  dejarEnBandeja,
  listarBandeja,
  pareceExportDelPlugin,
  tomarDeBandeja,
  type Bandeja,
} from "@/lib/motion/bandeja-puro";

export const dynamic = "force-dynamic";

// ANDAMIAJE: en diosa, el actor sale de la sesión.
async function actorDeSesion(): Promise<Actor> {
  return { id: "dev-local", rol: "admin", email: "dev@local" };
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
  const crudo = await pedido.text();
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
  const { bandeja: nueva, entrada } = dejarEnBandeja(bandeja(), contenido, nombreDado ?? forma.nombre, Date.now(), origen);
  g.__motionBandeja = nueva;
  return Response.json({ ok: true, entrada });
}

export async function GET(pedido: Request): Promise<Response> {
  const id = new URL(pedido.url).searchParams.get("id");
  if (!id) return Response.json({ ok: true, entradas: listarBandeja(bandeja()) });
  const tomada = tomarDeBandeja(bandeja(), id);
  if (!tomada) return Response.json({ ok: false, error: "esa entrada ya no está en la bandeja" }, { status: 404 });
  g.__motionBandeja = tomada.bandeja;
  return new Response(tomada.contenido, { status: 200, headers: { "content-type": "application/json; charset=utf-8" } });
}

export async function DELETE(pedido: Request): Promise<Response> {
  const id = new URL(pedido.url).searchParams.get("id");
  if (!id) return Response.json({ ok: false, error: "Falta id" }, { status: 400 });
  const tomada = tomarDeBandeja(bandeja(), id);
  if (tomada) g.__motionBandeja = tomada.bandeja;
  return Response.json({ ok: true, habia: !!tomada });
}
