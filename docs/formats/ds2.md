# Format DreamStation 2 (SD)

Font: loader PRS1 d'OSCAR (`prs1_loader.cpp`, classe `PRDS2File`, GPLv3) + verificació amb una SD real (DS2 Advanced CPAP 420X150C, firmware V1.0.6).

## Estructura de la SD
```
P-SERIES/
  LAST.TXT
  <ID dispositiu, 8 hex>/
    PROP.BIN     propietats del dispositiu (xifrat; en clar: línies CLAU=valor)
    LOG.SEQ      xifrat
    D/NNN.B03    registres del dispositiu (settings/log)
    E/NNN.B04    registres d'events del dispositiu
    P0/ P1/ P2/  sessions; un grup de fitxers per sessió: XXXXXXXX.B01 / .B02 / .B05
    U/           buit a la mostra
```
Extensions observades: `B01` (~354 B, resum/capçalera de sessió), `B02` (~1-2 KB, events/estadístiques), `B05` (~100 KB, formes d'ona), `B03`, `B04`. El significat exacte de cada tipus **encara s'ha de confirmar**.

## Contenidor xifrat (verificat)
Tots els fitxers comencen amb una capçalera fixa de **0xCA bytes**; camps `u16 LE` o `u16 longitud + bytes`:

| Camp | Detall |
|---|---|
| `0x000D, 0x0001, 0x0001` | màgic |
| GUID | 36 bytes ASCII (UUID) |
| IV | 12 bytes |
| salt | 16 bytes |
| `0x0000, 0x0001` | reservat |
| import key + tag | 32 + 16 B, clau lligada al dispositiu (no es fa servir) |
| export key + tag | 32 + 16 B, clau de payload xifrada |
| payload tag | 16 B (tag GCM del cos) |

Derivació de la clau (clau comuna pública a OSCAR):
1. `common = AES-256-ECB-decrypt(clau="Patient access to their own data", COMMON_KEY)`
2. `salted = PBKDF2-HMAC-SHA256(common, salt, 10000 iteracions, 32 B)`
3. `payloadKey = AES-256-GCM-decrypt(salted, iv, exportKey, exportKeyTag)`
4. `payload = AES-256-GCM-decrypt(payloadKey, iv, cos, payloadTag)`

Les claus es repeteixen entre fitxers → cache (PBKDF2 és lent). Implementació: `packages/loaders/philips-ds2/src/container.ts`.

## Contingut en clar
- `PROP.BIN`: text `CLAU=valor` (CF, SN serial, MN model, SV firmware, FD/LD primera/última data epoch, PFN/EFN/DFN nombre de fitxers P/E/D, …).
- `*.B0x`: binari amb el format de *chunks* de PRS1 (ja parsejat a OSCAR: `prs1_parser*.cpp`). Els `.B01` desxifrats comencen amb `03 98 00 00 00 06 01 45 ...`.

## Pendent
- [x] Desxifrar contenidor
- [ ] Parsejar chunks (capçalera, tipus, CRC) i mapar B01/B02/B05 a esdeveniments/formes d'ona (família 6, `prs1_parser_xpap.cpp`)
- [ ] Mapar ajustos (D/B03) i events de dispositiu (E/B04)
- [ ] Validar AHI/hores/P95 contra OSCAR
