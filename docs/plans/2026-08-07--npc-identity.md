# Plan: NPC Identity Model

> Draft from ChatGPT without repository files access. Review before implementation!

**Cel:**  
Zbudowanie fundamentu danych opisujących mieszkańców Seedvale.

Nie implementujemy jeszcze pełnego życia NPC, harmonogramów ani relacji. Przygotowujemy warstwę, która pozwoli później tworzyć bardziej autonomicznych mieszkańców i sytuacyjne zachowania.

---

## Założenia

Obecny NPC posiada:

- potrzeby (`needs`),
- FSM zachowania,
- `personality` używane w dialogach i reakcjach na gracza.

Nie zastępujemy istniejących systemów. Rozszerzamy je.

Docelowy model NPC:

```ts
NPC {
  role
  personality
  traits
  needs
}
```

---

# Personality — migracja do Big Five

Obecny system `personality` jest pierwszą, uproszczoną wersją modelu osobowości.

Aktualnie:
- określa sposób odpowiedzi NPC,
- wpływa na dialog i reakcje gracza.

Docelowo zostanie zmigrowany do modelu Big Five (OCEAN):

```ts
personality: {
  openness: number,
  conscientiousness: number,
  extraversion: number,
  agreeableness: number,
  neuroticism: number
}
```

Migracja będzie etapowa:

1. Zachowanie obecnych osobowości i istniejących zachowań.
2. Dodanie mapowania obecnych typów osobowości na wartości Big Five.
3. Stopniowe przepięcie systemów na model wymiarowy.

Przykład:

```text
curious
→ openness: 0.8
```

Celem nie jest tylko zmiana nazwy lub struktury danych, ale stworzenie modelu, który będzie mógł wpływać na przyszłe decyzje NPC.

---

# Role NPC

NPC posiada jedną aktywną rolę.

Przykładowe role:

- `woodcutter`
- `farmer`
- `guard`
- `trader`

Rola opisuje:

- funkcję NPC w społeczności,
- preferowane aktywności,
- możliwe przyszłe zadania.

Rola nie jest permanentna — w przyszłości NPC może ją zmienić.

Nie implementujemy jeszcze:

- kariery,
- szkolenia,
- awansów,
- harmonogramów pracy.

---

# Traits

Traits opisują indywidualne właściwości NPC.

Przykłady:

- `strong`
- `hardworking`
- `skilled_woodworker`
- `good_with_animals`
- `night_owl`

Traits nie zastępują personality.

Rozdzielenie odpowiedzialności:

## Personality

Opisuje:
- sposób myślenia,
- reakcje,
- styl komunikacji.

## Traits

Opisują:
- zdolności,
- predyspozycje,
- ograniczenia,
- cechy wpływające na skuteczność działań.

---

# Zakres pierwszego etapu

Dodajemy:

- model `role`,
- model `traits`,
- strukturę `NPC Identity Model`,
- przygotowanie migracji `personality` do Big Five.

Nie dodajemy jeszcze:

- domów,
- snu,
- harmonogramów dnia,
- relacji między NPC,
- generatora questów,
- pełnego systemu życia mieszkańców.

---

# Kierunek rozwoju

Docelowo zachowanie NPC będzie wynikało z połączenia:

```
Identity
   +
Needs
   +
Role
   +
Personality (Big Five)
   +
Traits
   ↓
FSM / decyzje / aktywności
```

Celem jest stworzenie mieszkańców, którzy mają własną tożsamość i mogą generować emergentne zachowania, a nie tylko pełnić rolę statycznych NPC od questów.