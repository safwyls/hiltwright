# Preparing a hilt model for Hiltwright's demo room

A guide for saber designers who want to contribute a hilt. The demo room is where Hiltwright owners see a saber in 3D: they ignite it, swing it, hear its font and try blade looks. A contributed hilt appears in the room's hilt list, credited to you and shown with your licence.

You send us a model file. We turn it into an encrypted Hiltwright pack (`.hwpack`) and ship that, never your file. [How your model is protected](#how-your-model-is-protected) explains what that does and doesn't guard against.

## Quick checklist

1. **Export GLB** (`.glb`) if your CAD tool can. If it can't, export **OBJ with its MTL** (`.obj` + `.mtl`). [Which to use, tool by tool](#tool-by-tool).
2. Model at **real size**, in any unit.
3. Draw the hilt **around the blade's centreline**, with the file's origin on that line.
4. **Give each finish its own appearance** (chrome, brushed, anodised, brass, paint) and give it a name that says what it is.
5. **Remove the internals**: chassis, electronics, screws, threads, springs.
6. **Turn off mesh compression** (Draco or "compress") when exporting a GLB.
7. **Load it into the demo room yourself**, set the fit, and click **Copy fit**.
8. Send us the file(s), the copied fit, the hilt's name, the name to credit you under, and your licence terms.

## Which file format

| | GLB (preferred) | OBJ + MTL (fallback) |
|---|---|---|
| Files | One `.glb` | Two: the `.obj` and its `.mtl`, which holds the colours |
| Finishes | Metal and roughness come from the file, when your tool writes them | Only a colour comes through; metal or paint is guessed from it (see below) |
| Units | Always metres, by the standard | Unitless; the tool's export unit applies |

**Please don't send STL.** STL carries no colours or materials, and the packer doesn't read it. You *can* load an STL into the demo room for your own preview; it shows in plain steel.

**Please don't send a `.gltf` with a separate `.bin`.** The packer can read one, but the demo room's preview can't, so you couldn't check it. Choose the binary GLB option.

### How finishes come through

A pack stores each material as **one colour plus how metallic and how rough it is**. Image textures are left out, and so are decals and printed graphics. Engraving, knurling and grip patterns survive only when they are modelled as geometry.

- **From a GLB**, your tool's metal and roughness values are used as they are. If a material doesn't state them, they're guessed as for OBJ.
- **From an OBJ**, only the colour survives. Hiltwright guesses the rest:
  - A material whose name mentions aluminium, steel, chrome, brass, copper, nickel, titanium, metal, gold or silver is treated as metal.
  - A neutral grey or black is treated as bare or anodised metal.
  - A gold or yellow tone is treated as brass.
  - Any other colour is treated as paint or plastic.

Wherever the guess or the file is wrong, tell us which material is which finish and we set it by hand. The finishes available are **chrome, polished, brushed, satin, anodised, brass, paint, plastic**. This works best when every finish has its own appearance with a name that means something. "Emitter chrome" is easier to match than "Appearance 7".

## Preparing the model (any tool)

**Real size, any unit.** Hiltwright reads the longest dimension and works out the unit from it. A hilt between 15 and 50 cm long is recognised whether the file is in metres, centimetres, millimetres or inches. Owners can adjust the length afterwards, but a correct size means nobody has to.

**The long axis is the blade axis.** Hiltwright stands the model up along its longest dimension. Which end the blade comes out of can be flipped in the fit, so either direction is fine. A curved hilt whose longest dimension doesn't run along the bore can be leaned back into line with the fit's **Lean** controls.

**Put the origin on the blade's centreline.** Where possible, model the hilt around the bore and place the file's origin (0, 0, 0) on the blade's centreline. The emitter's centre is ideal. Hiltwright then turns the hilt about the real bore. If you don't, it falls back to the middle of the model's bounding box. That is wrong for any hilt with a control box, clamp card or other feature on one side, because the hilt wobbles around the blade as it turns.

**Only the outside.** Delete or hide everything that can't be seen from outside the assembled hilt: chassis, electronics, speaker, battery, screws, internal threads and springs. Hidden bodies may still be exported, so delete them or leave them out of the export. This keeps the file small and keeps your internal design out of the pack.

**A sensible mesh density.** Curves should look smooth up close, but CAD exports can be far denser than anything the room needs. For scale, the built-in hilt is about 22,000 triangles. We suggest staying under about 250,000. If yours is far above that, lower the export resolution a step.

**Compression off.** GLB exporters often offer Draco or "compress mesh" options. The packer can't read compressed meshes and will reject the file, so leave them off. A GLB is small enough without them.

## Tool by tool

Menu names below are taken from each vendor's current help pages, listed under [Sources](#sources). CAD tools move menus around, so if something doesn't match your version, the vendor's page is the reference.

### Autodesk Fusion: OBJ + MTL

Fusion has no built-in GLB export, so send OBJ with its MTL.

1. In the Browser, right-click the top-level component (or the body, for a single-body design) and choose **Save As Mesh**.
2. Set **Format** to **OBJ**.
3. Set **Unit Type** to **Millimeter**.
4. Set **Refinement** to **High**. If curves still look faceted in the preview, use **Custom** and lower the surface deviation.
5. Save. Fusion writes an `.obj` and an `.mtl` side by side; send both.

Autodesk notes that colours come through for *default* appearances. If a customised appearance comes out grey in the preview, switch that part to a standard library appearance before exporting, or tell us what finish it should be.

*Optional, if you want exact metal and roughness:* import the OBJ into Blender (free), set **Metallic** and **Roughness** on each material, then choose **File > Export > glTF 2.0** with the format set to **glTF Binary (.glb)** and compression left off. This is only worth doing if the named finishes above don't cover your hilt.

### SOLIDWORKS: GLB (2020 and later)

1. Hide or suppress the internal components.
2. Choose **File > Save As** and set the type to **Extended Reality Binary (\*.glb)**.
3. Click **Options** and make sure **Draco compression is off**. You won't need cameras, views or motion studies, so they can be left out.
4. Save and send the `.glb`.

SOLIDWORKS has no native OBJ export. If you're on a version older than 2020, contact us before exporting anything. STL won't carry your finishes.

### Onshape: GLB

1. Right-click the **Part Studio** or **Assembly** tab and choose **Export**.
2. Set **Format** to **GLB**.
3. Set **Resolution** to **Fine**. If curves still look faceted, use **Custom** and tighten the tolerances.
4. Leave the **compress** option unticked.
5. Export and send the `.glb`.

Fallback: exporting as **OBJ** downloads a `.zip` that holds the `.obj` and `.mtl`. Send the zip as it is.

Note for Onshape Free users: documents on the Free plan are **public**. If your hilt design isn't public already, keep that in mind before modelling it there.

### Shapr3D: GLB (Pro)

1. Open **Export** and choose **GLB** (available since version 5.650).
2. Set the resolution to high, or use custom deviation and angle for smoother curves.
3. Set units to **mm**.
4. Turn **compression off**.
5. Export and send the `.glb`.

GLB and OBJ export need Shapr3D Pro. The free Basic plan exports only low-resolution STL and 3MF, and we can't pack either. Shapr3D's OBJ export carries colour as vertex colours, which the packer doesn't read, so use GLB. If your OBJ export does come with an `.mtl`, that works as the fallback.

### Any other tool

Export GLB with PBR (metal and roughness) materials and compression off. If your tool can't do that, export OBJ with its MTL. Blender is a reliable free converter from OBJ + MTL to GLB.

## Check it in the demo room, then copy the fit

Before sending, load your model into Hiltwright yourself. This shows exactly how the room reads it, and the fit you set there ships with the pack, so every owner sees the hilt the same way.

1. Open the demo room and, under **Hilt**, click **Load**.
2. Select your `.glb`. For an OBJ, select the `.obj` **and** the `.mtl` together (Ctrl-click or Cmd-click both). An OBJ loaded without its MTL shows without colours.
3. Open **Fit and placement** and adjust until the blade comes out of the emitter cleanly:

| Control | What it does |
|---|---|
| Length | Overall hilt length, if the unit guess got it wrong |
| Turn | Rotates the hilt about the blade, so the activation box faces the front |
| Shift X / Shift Z | Slides the hilt sideways so the blade sits in the bore (millimetres) |
| Seat | How deep the blade sits in the emitter, for shrouds or flares that extend past the socket |
| Staff seat | For a staff: how deep the second blade sits in the pommel |
| Lean / Lean side | Tilts a curved hilt back into line with the blade |
| Axis | Where the bore is: **File** uses your origin, **Box** uses the model's middle, **Auto** chooses between them |
| Blade at the other end | Flips which end the blade comes out of |

4. Click **Copy fit** and paste what it copies into your message to us.

The preview is stored only on your own computer. Nothing is uploaded. It can differ slightly from the finished pack: the preview shows image textures and the pack doesn't, and an OBJ's finishes are guessed a little differently in each. We check the packed version before it ships.

## What to send

- The `.glb`, or the `.obj` and `.mtl` (plus any texture images the MTL names, though they won't be packed).
- The copied fit.
- The hilt's display name.
- How you'd like to be credited.
- Your licence terms, e.g. "All rights reserved", or a Creative Commons licence.
- Anything the preview got wrong about finishes, e.g. "the grey on the pommel is black anodised, not steel".

## How your model is protected

**Short version:** owners can see and use your hilt in the demo room, but there's no file for them to copy. What ships is an encrypted, stripped-down display copy that only Hiltwright can open, and Hiltwright never writes it back out. It stops casual copying. It can't stop a determined person with specialist tools, and nothing that shows a 3D model on screen can. Your credit and licence travel with the hilt and are shown whenever it's in use.

### The details

**What we keep from your file.** At packing time your model becomes a plain display mesh: triangles, surface normals, and one colour, metalness and roughness value per material. Everything else is dropped: CAD history, sketches, features, dimensions, part names, textures and assembly structure. Positions are baked in, so the pack is a single shell with no separate parts to pull out. It's also stored in Hiltwright's own mesh layout rather than a standard 3D format, so a 3D viewer or slicer won't open it even once decrypted.

**How it is locked.** The mesh is compressed, then encrypted with AES-256-GCM, a standard authenticated cipher. Each pack has its own key, derived with HKDF-SHA256 from a key built into Hiltwright plus the pack's ID. "Authenticated" means a pack that has been altered in any way fails to open, rather than loading a modified model.

**What is readable.** Only the pack's label: the hilt's name, your credit, the licence, the fit, and what the app may do with it. That's what lets Hiltwright list the hilt and credit you without unlocking it. We can correct a credit or licence later without rebuilding the pack.

**What the app does with it.** Hiltwright decrypts the mesh into memory only while the hilt is on screen. It never writes a decrypted copy to disk, never copies it to a saber's SD card, and has no export for it. The pack file in the install folder is useless outside Hiltwright.

**What it doesn't do.** The key has to ship inside Hiltwright so the app can open the pack. Anyone willing to take the app apart could find it, and a graphics-capture tool can record any mesh a program draws on screen. This applies to every game and 3D viewer, not just ours. The encryption is a lock on the front door against someone who finds a file and tries to open, print or share it. It isn't a vault. Your licence, shown with the hilt, is your formal protection. Removing internals and keeping the model to its outer shell (see above) limits what could be taken in the first place.

## Sources

Export steps above are based on these vendor pages:

- Autodesk Fusion: [Save As Mesh](https://help.autodesk.com/cloudhelp/ENU/Fusion-Mesh/files/MESH-SAVE-AS-MESH.htm) · [Exporting an OBJ with an MTL file](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/Exporting-an-OBJ-file-with-an-MTL-file-from-Fusion-360.html)
- SOLIDWORKS: [Exporting using Extended Reality](https://help.solidworks.com/2025/english/solidworks/sldworks/t_export_using_extended_reality.htm) · [GLB/glTF Extended Reality files](https://help.solidworks.com/2025/english/solidworks/sldworks/c_glb_gltf_extended_reality_files.htm) · [glTF export introduced in 2020](https://help.solidworks.com/2020/English/WhatsNew/c_visulaize_glTF_export_AR_VR.htm)
- Onshape: [Exporting files](https://cad.onshape.com/help/Content/File/exporting_files.htm) · [Public documents on the Free plan](https://cad.onshape.com/help/Content/Plans/public_documents.htm)
- Shapr3D: [Export](https://support.shapr3d.com/hc/en-us/articles/7874524196764-Export) · [5.650 release notes (GLB)](https://support.shapr3d.com/hc/en-us/articles/14716303463580-5-650-Manage-references-in-History) · [Shapr3D Basic limits](https://support.shapr3d.com/hc/en-us/articles/7872024839452-Shapr3D-Basic)
- Blender: [glTF 2.0 exporter](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html) · [OBJ importer](https://docs.blender.org/manual/en/latest/files/import_export/obj.html)

The packing and loading code is in `apps/desktop/src/main/hwpack.ts`, `apps/desktop/scripts/hwpack.ts` and `apps/desktop/src/renderer/src/hiltModel.ts`.
