// Stub de @xenova/transformers para el bundle de la DEMO publicada: la
// página vive bajo un CSP sin huggingface.co (el modelo no puede bajar) y
// el runtime real pesa megas. El editor degrada con un aviso legible.
export const env = { allowLocalModels: false };

export async function pipeline(): Promise<never> {
  throw new Error("La transcripción por voz no está disponible en la demo publicada");
}
