# Better visual effects

**Status:** `planned`
**Created:** 2026-08-11
**Priority:** 🟡 medium · **Effort:** ? · **Depends on:** -

> Authored by ChatGPT - review needed.

Tak. Patrząc na aktualny kod Seedvale i ten screenshot, **nie szedłbym teraz w ciężkie shadery**. Macie już sporo dobrych rzeczy: ACES, SMAA, N8AO, bloom, god rays, normal mapę terenu, custom shader trawy i miękkie cienie.

Największy problem na screenie to moim zdaniem **nie brak geometrii, tylko zbyt płaski/„plastikowy” rendering + mocno rozmyta atmosfera**.

### Co dałoby największy efekt za mały koszt

| Mechanizm                                         | Efekt                                                 | Koszt |
| ------------------------------------------------- | ----------------------------------------------------- | ----: |
| **Terrain fragment shader – macro variation**     | ziemia przestaje wyglądać jak jednolity zielony dywan |    🟢 |
| **Fake sunlight / backlighting dla trawy**        | trawa wygląda dużo bardziej naturalnie                |    🟢 |
| **Distance-based terrain detail**                 | blisko szczegół, daleko czysta powierzchnia           |    🟢 |
| **Lepszy atmospheric fog**                        | mniej „białej ściany” na horyzoncie                   |    🟢 |
| **Screen-space dithering / subtle color grading** | bardziej filmowy obraz                                |    🟢 |
| **Tree/foliage wind shader**                      | drzewa przestają być statycznymi modelami             |    🟡 |
| **Cheap water Fresnel shader**                    | dużo lepsza woda                                      |    🟡 |
| CSM / volumetric clouds / SSR                     | duży efekt, ale większy scope                         |    🔴 |

### 1. Najbardziej polecam: shader powierzchni terenu

Obecnie teren jest `MeshStandardMaterial` z `vertexColors` i detail normal mapą.

Problem: kolor podstawowy nadal jest głównie wyliczany **per vertex**. Można bardzo tanio dodać fragment shader:

```text
terrain color
    ↓
macro noise
    ↓
small color variation
    ↓
roughness variation
    ↓
lighting
```

Czyli np.:

* trawa: różne odcienie zieleni w dużych, nieregularnych obszarach,
* sucha ziemia: bardziej brązowa,
* mokra ziemia: ciemniejsza,
* piasek: lekko różna jasność,
* skały: większy kontrast.

**Jedna mała tileable texture + 1–2 sample w shaderze** wystarczy.

To byłoby moim zdaniem dużo bardziej wartościowe niż zwiększanie rozdzielczości terenu.

Co ważne, macie już mechanizm `onBeforeCompile` dla terrain shaderów, więc architektonicznie nie trzeba tworzyć całego `ShaderMaterial` od zera.

---

### 2. Trawa: bardzo tani fake subsurface/backlighting

Na screenshotcie trawa wygląda trochę jak **zielone plastikowe blaszki**.

Wasz grass już ma własny vertex shader i `uTime` dla wiatru.

Do fragment shadera można dodać coś w rodzaju:

```glsl
float backlight = 1.0 - max(dot(normal, sunDirection), 0.0);
color *= 1.0 + backlight * 0.15;
```

i dodatkowo lekko rozjaśniać cienkie, podświetlone przez słońce źdźbła.

Efekt:

**trawa zaczyna wyglądać jak roślinność, a nie zielone geometryczne karty.**

Koszt praktycznie pomijalny.

---

### 3. Terrain detail zależny od odległości

To jest szczególnie sensowne w waszym przypadku.

Macie już detail normal:

* `tilesGrass = 4`
* `tilesBare = 12`
* `strength = 3`.

Dodałbym w shaderze:

```text
distance < 20m  → 100% detail
20–50m          → fade
>50m            → 0%
```

Dzięki temu można nawet zwiększyć jakość bliskiego terenu bez generowania niepotrzebnego detalu dla całego świata.

Wasz wcześniejszy review właściwie wskazuje dokładnie ten kierunek jako następny krok.

---

### 4. Fog — tutaj widzę bardzo duży potencjał

Na screenie horyzont jest mocno wyprany.

Aktualnie używacie:

```text
THREE.Fog
near ≈ 130–180
far  ≈ 180–260
```

i osobnego Preetham `Sky`.

To daje dość mocną liniową atmosferę.

Zamiast zwiększać szczegół świata, zrobiłbym **atmospheric perspective shader**:

```text
near → normalny kolor
mid  → lekko desaturowany
far  → kolor nieba
```

ale z krzywą `smoothstep`, zamiast zwykłego linear fog.

Efekt wizualny jest bardzo duży:

> teren nadal jest widoczny, ale odległe elementy naturalnie znikają w atmosferze.

---

### 5. Woda — Fresnel

Jeżeli chcecie jeden mały shader, który wizualnie bardzo dużo daje, to **woda**.

Obecny ocean ma już normal mapę, ale macie nawet odnotowany problem z artefaktami normal mapy w odbiciach.

Dodałbym prosty:

```glsl
float fresnel = pow(1.0 - dot(viewDir, normal), 4.0);
```

i na tej podstawie:

* patrzysz z góry → bardziej kolor wody,
* patrzysz pod małym kątem → więcej odbicia nieba.

Bez SSR.

**Bardzo tani efekt, a woda zaczyna wyglądać dużo bardziej „3D”.**

---

### 6. Drzewa — prosty wind shader

Drzewa są obecnie GLB i ładowane jako wspólne zasoby/materialy.

Nie robiłbym pełnej animacji.

Można w vertex shaderze zrobić:

```text
wind = sin(time + worldPosition.x * scale)
```

i przesuwać **tylko wierzchołki powyżej określonej wysokości**.

Czyli:

```text
pień       → prawie nieruchomy
dolna część → minimalny ruch
korona      → większy ruch
```

To byłoby bardzo tanie, a przy dużej liczbie drzew efekt „żywego świata” byłby ogromny.

---

## I jeszcze jedna rzecz: nie zwiększałbym teraz geometrii

Obecny teren ma `resolution = 65` domyślnie, `chunkSize = 64`, a na chunk przypada ~8192 trójkątów.

Na screenie **nie widzę problemu „za mało polygonów”**.

Wręcz przeciwnie — obecna geometria + normal map + grass już daje wystarczającą bazę.

Największy stosunek:

**jakość / koszt**

będzie teraz z shaderów i atmosfery, nie z większej liczby polygonów.

### Gdybym miał zrobić tylko 4 rzeczy

1. **Terrain macro-color shader** ⭐⭐⭐⭐⭐
2. **Grass backlighting / fake subsurface** ⭐⭐⭐⭐⭐
3. **Lepszy atmospheric fog / distance desaturation** ⭐⭐⭐⭐
4. **Water Fresnel** ⭐⭐⭐⭐

A dopiero potem:

5. tree wind shader
6. bardziej zaawansowane cienie
7. chmury

To mogłoby dać **bardzo zauważalny skok jakości bez przebudowy renderera**.
