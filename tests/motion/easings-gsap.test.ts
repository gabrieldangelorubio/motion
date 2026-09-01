/* Tests del puente GSAP (fork GSAP, tanda G1): cualquier ease de GSAP entra
   al motor como función pura — con overshoot paramétrico de verdad — y un
   spec roto degrada a «suave» sin romper nada. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EASINGS, easing, esEasingConocido, velocidadEn } from "@/lib/motion/easings-puro";
import { easingGsap, EASINGS_GSAP_DESTACADOS } from "@/lib/motion/easings-gsap";
import { interpolar } from "@/lib/motion/keyframes-puro";

test("un spec GSAP resuelve a la curva real: back.out(3) tiene SU overshoot", () => {
  const fn = easing("back.out(3)");
  assert.equal(fn(0), 0);
  assert.equal(fn(1), 1);
  assert.ok(fn(0.5) > 1.1, `back.out(3) sobrepasa 1 en el medio (dio ${fn(0.5)})`);
  // paramétrico DE VERDAD: más overshoot que el back de la casa (bezier fijo)
  const casa = EASINGS.salidaBack;
  assert.ok(fn(0.5) > casa(0.5), "back.out(3) exagera más que salidaBack");
});

test("elastic paramétrico, steps a medida y curva custom por path SVG", () => {
  const elastico = easing("elastic.out(1,0.75)");
  assert.equal(elastico(1), 1);
  assert.ok(Math.abs(elastico(0.99) - 1) < 0.2, "elastic asentado cerca del final");

  const pasos = easing("steps(4)");
  const valores = new Set(Array.from({ length: 41 }, (_, i) => pasos(i / 40)));
  assert.ok(valores.size <= 5, `steps(4) cuantiza en ≤5 niveles (dio ${valores.size})`);

  const curva = easing("M0,0 C0.2,0 0.1,1 1,1");
  assert.equal(curva(0), 0);
  assert.equal(curva(1), 1);
  assert.ok(curva(0.5) > 0.5, "la curva custom acelera temprano");
});

test("los nombres de la casa NO pasan por GSAP y un spec roto degrada a suave", () => {
  assert.equal(easing("salidaExpo"), EASINGS.salidaExpo);
  assert.equal(easing("no-existe-tal-cosa"), EASINGS.suave);
  assert.equal(easing(undefined), EASINGS.suave);
  assert.equal(easingGsap("no-existe-tal-cosa"), null);
});

test("esEasingConocido valida casa + GSAP y rechaza specs rotos (la validación del director)", () => {
  assert.ok(esEasingConocido("resorteRebote"));
  assert.ok(esEasingConocido("back.out(2.5)"));
  assert.ok(esEasingConocido("bounce.in"));
  assert.ok(!esEasingConocido("cualquierverdura"));
  for (const spec of EASINGS_GSAP_DESTACADOS) {
    assert.ok(esEasingConocido(spec), `destacado inválido: ${spec}`);
  }
});

test("determinismo y cache: mismo spec, misma función, mismos valores", () => {
  const a = easing("elastic.out(1.2,0.4)");
  const b = easing("elastic.out(1.2,0.4)");
  assert.equal(a, b, "el cache devuelve la MISMA función");
  assert.equal(a(0.37), b(0.37));
});

test("el motor entero honra un ease GSAP: keyframes con overshoot y motion blur con derivada finita", () => {
  // interpolar usa easing() por adentro: un tramo con back.out(3) sobrepasa el destino
  const pista = [
    { t: 0, v: 0, easing: "back.out(3)" },
    { t: 1000, v: 100 },
  ];
  assert.ok(interpolar(pista, 500) > 100, "el tramo sobrepasa el valor final a mitad de camino");
  assert.equal(interpolar(pista, 1000), 100);

  const v = velocidadEn(easing("bounce.out"), 0.5);
  assert.ok(Number.isFinite(v), "velocidadEn (motion blur) funciona sobre eases GSAP");
});
