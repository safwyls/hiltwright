// A simulator for any look in the library: built looks from their saved layers, pasted looks by reading their code.

import type { LookDef } from './looks';
import { canSimulateLook, registerStyleSim } from './sim';
import { isStyleDoc, styleToSim } from './styleBuilder';
import { evaluateStyle, isTreeDoc, parseStyle, treeToSim } from './styleTree';

/** Register a simulator for `look` if one can be made; true when the look can now be previewed and swung. */
export function registerLookSim(look: LookDef): boolean {
  if (canSimulateLook(look.id)) return true;
  try {
    if (isStyleDoc(look.style)) registerStyleSim(look.id, styleToSim(look.style));
    else if (isTreeDoc(look.style)) registerStyleSim(look.id, treeToSim(look.style));
    else if (look.source === 'pasted' && look.code) {
      // Pasted code is the slot expression; the alias define, when there is one, carries the style itself.
      const text = look.define ? look.define.replace(/^\s*using\s+\w+\s*=\s*/, '').replace(/;\s*$/, '') : look.code;
      registerStyleSim(look.id, evaluateStyle(parseStyle(text)).make);
    } else return false;
    return true;
  } catch { return false; }
}
