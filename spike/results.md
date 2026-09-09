| build | config | board | result | wall time | .dfu bytes | .text bytes |
|---|---|---|---|---|---|---|
| v3-default-cold | proffieboard_v3_config.h | ProffieboardV3-L452RE | FAIL | 8.4 s |  |  |
| v3-default-warm | proffieboard_v3_config.h | ProffieboardV3-L452RE | FAIL | 6.6 s |  |  |
| v2-default | proffieboard_v2_config.h | ProffieboardV2-L433CC | FAIL | 7.8 s |  |  |
| v3-os6-example | OS6_config_example.h | ProffieboardV3-L452RE | FAIL | 3.6 s |  |  |
| v2-os6-example | OS6_config_example.h | ProffieboardV2-L433CC | ok | 49.0 s | 226072 | 226048 |
| v3-default-cdc-only | proffieboard_v3_config.h | ProffieboardV3-L452RE | FAIL | 7.0 s |  |  |
| v3-baseline-cold | saberbench_v3_baseline.h | ProffieboardV3-L452RE | ok | 58.2 s | 227584 | 227560 |
| v3-baseline-warm | saberbench_v3_baseline.h | ProffieboardV3-L452RE | ok | 63.6 s | 227584 | 227560 |
| v3-baseline-cdc-only | saberbench_v3_baseline.h | ProffieboardV3-L452RE | ok | 57.6 s | 222944 | 222920 |
| v2-baseline | saberbench_v2_baseline.h | ProffieboardV2-L433CC | ok | 54.3 s | 226072 | 226048 |
| v3-verification-3blade | proffieboard_v3_verification_config.h | ProffieboardV3-L452RE | ok | 19.0 s | 197352 | 197328 |
| err-board-mismatch | OS6_config_example.h | ProffieboardV3-L452RE | FAIL | 4.6 s |  |  |
| err-blade-count | saberbench_v3_baseline.h | ProffieboardV3-L452RE | FAIL | 8.3 s |  |  |
| err-style-typo | saberbench_v3_baseline.h | ProffieboardV3-L452RE | FAIL | 8.4 s |  |  |
| err-missing-comma | saberbench_v3_baseline.h | ProffieboardV3-L452RE | FAIL | 4.6 s |  |  |
| err-prop-define-conflict | saberbench_v3_baseline.h | ProffieboardV3-L452RE | FAIL | 3.0 s |  |  |
| err-wrong-pin-name | saberbench_v3_baseline.h | ProffieboardV3-L452RE | ok | 46.0 s | 227584 | 227560 |
| v3-baseline-incremental-nochange | saberbench_v3_baseline.h | ProffieboardV3-L452RE | ok | 40.5 s | 227584 | 227560 |
| v3-baseline-incremental-edited | saberbench_v3_baseline.h | ProffieboardV3-L452RE | ok | 39.6 s | 228112 | 228088 |
