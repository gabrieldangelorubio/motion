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
