# Implementacja nowoczesnego renderowania trawy w Three.js – wskazówki dla Claude Code

## Cel

Przeanalizuj możliwość zaimplementowania nowoczesnego systemu renderowania trawy inspirowanego rozwiązaniami stosowanymi w grach AAA (np. Ghost of Tsushima). Priorytetem jest wydajność przy bardzo dużej liczbie źdźbeł oraz wysoka jakość animacji.

---

# Główna architektura

## 1. Podział świata na kafelki (Grass Tiles)

Nie generuj całej trawy jednocześnie.

Podziel teren na niewielkie kafelki, np.:

* 8x8 m
* 16x16 m

Każdy kafelek posiada własne dane:

* bounding box
* seed dla generatora
* listę źdźbeł lub parametry ich generowania
* poziom LOD

Dzięki temu możliwe jest:

* frustum culling
* distance culling
* streamowanie
* regeneracja tylko potrzebnych fragmentów.

---

## 2. Proceduralne rozmieszczenie źdźbeł

Nie zapisuj pozycji każdego źdźbła.

Zamiast tego:

dla każdego tile:

* użyj deterministic random (seed)
* noise (Simplex/Perlin)
* density map
* biome mask

Na tej podstawie generuj:

* pozycję
* wysokość
* obrót
* szerokość
* typ rośliny

To pozwala odtwarzać identyczny wynik bez przechowywania dużych ilości danych.

---

## 3. GPU Instancing

Każde źdźbło nie powinno być osobnym obiektem Three.js.

Zamiast tego użyj:

InstancedMesh

lub (lepiej)

InstancedBufferGeometry.

Per-instance przechowuj np.:

* position
* scale
* rotation
* random seed
* wind factor
* color variation

CPU wysyła jedynie dane instancji.

Render odbywa się jednym draw call.

---

## 4. Vertex Shader

Vertex Shader odpowiada za:

* zginanie źdźbeł
* wiatr
* lokalne odchylenia
* animację

Przykładowe wejścia:

* global time
* wind texture
* noise
* player position

Animacja powinna opierać się na:

sin()

noise

curl noise

zamiast prostego kołysania.

---

## 5. Pixel Shader

Pixel shader powinien dodawać:

### Color variation

Losowa zmiana odcienia

zielony

żółty

sucha trawa

---

### Fake AO

Przy podstawie:

ciemniejszy kolor

Na końcówkach:

jaśniejszy.

---

### Fake SSS

Symulacja przeświecania światła przez liście.

Można użyć prostego Fresnel.

---

### Lighting

Uwzględnić:

* directional light
* ambient light
* shadow factor

---

## 6. Wind System

Nie animować każdego źdźbła identycznie.

Połączyć:

global wind

*

noise texture

*

instance random

Dzięki temu wiatr wygląda naturalnie.

---

## 7. LOD

Blisko kamery:

pełna geometria.

Dalej:

mniej źdźbeł

krótsze źdźbła

prostsza geometria.

Bardzo daleko:

billboard

lub

texture cards.

---

## 8. Frustum Culling

Każdy tile posiada bounding box.

Renderowane są wyłącznie widoczne kafelki.

---

## 9. Distance Culling

Nie renderować trawy poza określonym dystansem.

Np.

0–40 m

pełna jakość

40–80 m

LOD

80–120 m

billboard

> 120 m

brak renderowania.

---

## 10. Density Maps

Mapa może określać:

* gdzie rośnie trawa
* wysokość
* gęstość
* typ roślin

Można używać tekstur lub danych z terenu.

---

## 11. Interakcja z graczem

Rozważyć możliwość:

* uginania trawy pod graczem
* śladów po przejściu
* wpływu eksplozji
* wpływu pojazdów

Najczęściej realizowane jest to przez:

* render target
* displacement texture
* field texture

Shader odczytuje tę teksturę.

---

## 12. Compute Shader / WebGPU

Jeżeli projekt planuje migrację do WebGPU:

warto rozważyć wykorzystanie compute shaderów do:

* generowania instancji
* cullingu
* LOD
* animacji

Obecnie w WebGL należy wykonać większość tej logiki po stronie CPU.

---

# Co warto wykorzystać w Three.js

* InstancedMesh
* InstancedBufferGeometry
* ShaderMaterial
* RawShaderMaterial (jeżeli potrzebna pełna kontrola)
* DataTexture
* Noise textures
* Frustum Culling
* BVH tylko dla kolizji (nie dla renderingu)
* GPU-friendly uniforms

---

# Pytania do analizy

1. Czy obecna implementacja wykorzystuje InstancedMesh?

2. Czy renderowanie odbywa się jednym draw call?

3. Czy można przejść na InstancedBufferGeometry?

4. Czy warto przechowywać jedynie seed zamiast pełnej listy źdźbeł?

5. Czy podział na tile poprawi wydajność?

6. Czy można dodać LOD zależny od odległości?

7. Czy shader może obsłużyć bardziej naturalny wiatr (noise zamiast sin)?

8. Czy można dodać losowe zróżnicowanie koloru i wysokości?

9. Czy istnieje możliwość przejścia na WebGPU w przyszłości?

10. Jakie będą największe bottlenecki CPU i GPU przy 100k+, 500k+ oraz 1M instancji?

---

# Oczekiwany rezultat

Przygotuj analizę obecnej implementacji i zaproponuj plan refaktoryzacji z naciskiem na:

* maksymalną wydajność,
* skalowalność,
* niski koszt CPU,
* wykorzystanie GPU,
* łatwość rozszerzania (kolejne typy roślin),
* zgodność z Three.js oraz przyszłą migracją do WebGPU.

Dla każdej proponowanej zmiany opisz:

* oczekiwany zysk wydajności,
* koszt implementacji,
* ryzyka,
* wpływ na architekturę,
* priorytet (Must / Should / Nice to Have).
