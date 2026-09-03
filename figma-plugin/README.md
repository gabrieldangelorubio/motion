# Plugin de Figma — exportar una pantalla al módulo motion

## Instalar (una vez, plugin de desarrollo)

1. Figma escritorio → menú **Plugins → Development → Import plugin from manifest…**
2. Elegí `figma-plugin/manifest.json` de este repo.

## Usar

1. En Figma, seleccioná **un frame** (la pantalla que querés animar).
2. **Plugins → Development → diosa motion — exportar pantalla**.
3. Botón **Copiar JSON**.
4. En el editor de motion: botón **Importar de Figma** → pegar → Importar.

## Qué transfiere fiel y qué rasteriza

| Nodo | Cómo llega |
|---|---|
| Texto (estilo uniforme) | Capa de texto real: contenido, familia, peso, tamaño, interletrado, alineación, color |
| Rectángulo / elipse con fill sólido sin borde | Forma nativa (color, radio) |
| Frame / grupo / componente | Se aplana recursivo; el fondo sólido del frame entra como rect |
| Vectores, booleans, fills de imagen, bordes, efectos, rotaciones, texto mixto | **PNG 2× por nodo** con su aviso — siempre se ve bien, se pierde editabilidad solo ahí |

El plugin no usa red (`networkAccess: none`): el JSON viaja por copy/paste.
Los avisos de conversión aparecen en el editor al importar.


## Sin copy/paste: por el MCP de Figma (`use_figma`)

El mismo exportador corre dentro de Figma desde un agente con el conector
Figma (Claude Code). Requiere asiento Dev o Full en el plan (el asiento
View tiene un cupo mensual chico de llamadas).

1. `node figma-plugin/empaquetar-mcp.mjs <nodeId> --sin-rasters` → pegar la
   salida en el parámetro `code` de `use_figma` (con el `fileKey` del
   archivo). Devuelve la estructura: cada raster viene `pendiente` con su
   `figmaId`.
2. `node figma-plugin/empaquetar-mcp.mjs --rasters id1,id2,…` → un script
   chico que devuelve `{figmaId: base64}`; pedirlo por lotes.
3. `node _andamiaje/director-externo/fusionar-rasters.mjs estructura.json completo.json lote-1.json …`
4. `node _andamiaje/director-externo/dejar-en-bandeja.mjs completo.json --origen use_figma`
   → en el editor, «Importar de Figma» lista la entrada en la **Bandeja de
   entrada**; un clic la trae por el mismo camino que el pegado.

Qué cambia en ese sandbox respecto del plugin: es de solo lectura (sin
clones ni cambios temporales: opacidad y mezcla quedan horneadas en el PNG,
los frames con relleno de imagen y hijos se rasterizan enteros) y no tiene
`getRangeBounds`: los cortes de línea salen del SVG del texto sin
contornear (v22), con la misma fidelidad.
