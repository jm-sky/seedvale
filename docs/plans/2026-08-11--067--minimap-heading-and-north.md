# Plan: Minimapa heading-up + kompas N

**Status:** `done`
**Created:** 2026-08-11
**Priority:** ⚪ low · **Effort:** S · **Depends on:** ~~029~~, ~~046~~

## Cel

Minimapa ma obracać się z kierunkiem patrzenia gracza (heading-up: góra canvasu = look), a litera **N** ma wskazywać prawdziwą północ świata (−Z), krążąc po ramce mapy (styl GPS).

## Kontekst

Plan [029](./2026-08-07--029--minimap.md) zostawił mapę north-up (tylko translacja). Punkt 4 w [037](./2026-08-08--037--npc-genealogy-lineages.md) zakładał statyczne „N” u góry — **superseded** przez ten plan (przy rotacji stałe N = „przód”, nie północ).

Rysowanie żyje w Vue: `src/ui-vue/lib/drawMinimap.ts` + `MinimapScreen.vue`; facade `src/ui/createMinimap.ts`; yaw z `mouseLook.state.yaw` w `gameLoop`.

## Zakres

1. Przepuścić `yaw` przez `Minimap.update` → registered drawer → `drawMinimapFrame`.
2. Rotacja delty świata o `yaw` (forward = góra); to samo dla strzałek do osad.
3. Marker gracza: trójkąt w górę (zamiast diamentu).
4. Litera `N` na okręgu wewnętrznym w kierunku prawdziwej północy po rotacji: `(sin(yaw), -cos(yaw))`.

## Poza zakresem

- Genealogy / rody (037 poza minimapą)
- Zoom, biomowe kolory, nowe landmarki
- Toggle north-up / heading-up

## Implementacja (2026-08-11)

- `src/ui-vue/lib/drawMinimap.ts` — heading-up + N + trójkąt
- `src/ui/createMinimap.ts`, `MinimapScreen.vue`, `gameLoop.ts` — `yaw` w update
- Punkt 4 w 037 oznaczony jako superseded

## Weryfikacja

- [x] `npx tsc --noEmit`, `npm run lint`, `npm run build` (techniczne przy zamknięciu)
- [x] Ręcznie (http://localhost:5577/): obrót myszą — mapa się kręci; N wędruje; przy yaw≈0 N u góry; strzałki/osady sensowne względem ruchu

## Powiązane

- [minimap](./2026-08-07--029--minimap.md)
- [npc-genealogy-lineages](./2026-08-08--037--npc-genealogy-lineages.md) — punkt kompasu N superseded
