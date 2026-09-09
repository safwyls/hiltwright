# Golden fixtures

- `saberbench_v3_os8.h`: the OS 8 config built and flashed in the pipeline spike (see `docs/06-spike-results.md`). Fett263 library styles reproduced with their copyright headers, as the library's GPL terms require.
- `proffieboard_v3_verification_config.h`, `proffieboard_v2_verification_config.h`, `OS6_config_example.h`, `proffieboard_v2_ob4.h`: copied unchanged from the ProffieOS `config/` folder (GPL-3.0, https://github.com/profezzorn/ProffieOS). They cover `SHARED_POWER_PINS`, `NO_BLADE` rows with separate preset arrays, `SPIBladePtr`, `SimpleBladePtr` with LED templates, `SubBlade` and `SubBladeReverse` chains, and preprocessor conditionals inside a blade table.

Tests assert that parsing then emitting a fixture yields a document that parses to the same model, and that specific facts (blade counts, pins, defines) are extracted correctly.
