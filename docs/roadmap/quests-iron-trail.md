# Iron Trail

> DRAFT from ChatGPT

Ten scenariusz ma największy potencjał systemowy.

Mamy już realnie:

```text
ResourceDeposit
→ Miner
→ resource-site Inventory
→ TransportOrder
→ Trader
→ SettlementEconomy
→ Blacksmith
```

Iron, coal, gold oraz pickaxe już istnieją.

### Trzy osady

**Osada Górska**

* minerzy,
* iron/gold,
* problemy z wydobyciem.

**Osada Leśna**

* charcoal / wood,
* dobry transport.

**Duża osada**

* mistrz kowalski,
* handel,
* największy popyt.

---

### Akt I — kowal bez żelaza

Mistrz kowalski nie daje klasycznego:

> przynieś 10 iron.

Mówi:

> „Nie potrzebuję kolejnego chłopa z rudą w kieszeni. Potrzebuję, żeby transport znowu działał.”

Czyli quest wskazuje **istniejący problem ekonomiczny**.

---

### Akt II — kopalnia

W górskiej osadzie dowiadujemy się, że:

* rudy jest dużo,
* ale wydobycie zwolniło,
* część złóż jest daleko,
* przewoźnicy nie chcą ryzykować podróży.

Możliwe problemy:

* niebezpieczna fauna przy trasie,
* uszkodzony szlak,
* konflikt między traderem a minerami,
* kradzieże.

---

### Akt III — konflikt ekonomiczny

Minerzy twierdzą:

> kupcy płacą za mało.

Traderzy:

> transport jest zbyt niebezpieczny.

Kowale:

> materiał jest zbyt drogi.

Każdy ma rację z własnej perspektywy.

Gracz może wesprzeć:

* minerów,
* traderów,
* kowali,
* kompromis między nimi.

To powinno zmieniać relation/reputation, ale później również **rzeczywistą ekonomię**.

---

### Akt IV — mistrzowski przedmiot

Kowal obiecuje:

> jeśli uda się ustabilizować dostawy, wykona coś wyjątkowego.

Potrzebuje:

```text
wysokiej jakości iron
+
coal
+
rzadkiego dodatku
+
dostępu do mistrzowskiego warsztatu
```

Gold może być dekoracyjnym dodatkiem albo materiałem części przedmiotu.

Przedmiot może być:

* mistrzowski miecz,
* topór,
* specjalny pickaxe,
* narzędzie symbolizujące wejście gracza do cechu.

---

### Akt V — cech

Drugi kowal sprzeciwia się wykorzystaniu sekretnej techniki.

Powstaje konflikt:

```text
mistrz
vs
cech
vs
bogaty trader
vs
minerzy
```

Możliwe zakończenia:

1. **Mistrz tworzy przedmiot dla gracza.**
2. **Technika trafia do cechu** — później lepsza produkcja osady.
3. **Kupiec wykupuje recepturę** — pieniądze, ale gorsze relacje rzemieślników.
4. **Minerzy dostają udział w zyskach**.
5. **Gracz zatrzymuje rzadki materiał**, przez co historia kończy się bez przedmiotu.

---

## Istotny problem techniczny dla scenariusza 3

Aktualny transport rudy działa:

> remote resource site → **jego osada**

ale `settlements-npcs-021` jawnie nie implementuje jeszcze **inter-settlement trade**.

Dlatego duży „Żelazny Szlak” między trzema osadami wymagałby prawdopodobnie najpierw jednego współdzielonego rozszerzenia:

```text
settlement storage
→ TransportOrder
→ other settlement storage
```

To byłby bardzo wartościowy system niezależny od questa.
