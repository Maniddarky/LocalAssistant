"""Original sample study notes. Not a reprint of any handbook."""

from pathlib import Path

import pymupdf

PAGES: list[tuple[str, str]] = [
    (
        "Density altitude",
        """Desk note DA-1: Density altitude is pressure altitude corrected for nonstandard temperature. When the air is hotter than the standard day, density altitude is higher than the pressure altitude.

Desk note DA-2: Higher density altitude means thinner air. The same airplane needs more runway to take off and climbs more slowly. This note does not give a numeric performance table. Use the airplane's own pilot operating handbook for distances and climb rates.

Desk note DA-3: A useful study check is to name the two ingredients in the correction: pressure altitude and temperature. This note treats that pair as the explanation you should be able to give before you look up charted performance.""",
    ),
    (
        "Weather minima in this sample",
        """Desk note WX-1: These figures are study examples stored in this sample file. They are not a promise that a regulation still reads this way. Confirm current minima in the official publication before you fly.

Desk note WX-2: In this sample, Class E airspace below 10,000 feet MSL is practiced with 3 statute miles visibility and cloud clearance of 500 feet below, 1,000 feet above, and 2,000 feet horizontal.

Desk note WX-3: In this sample, Class G airspace at night below 1,200 feet AGL is practiced with 3 statute miles visibility and the same 500 / 1,000 / 2,000 cloud clearance used in the Class E example. This note does not describe the more lenient daytime rule close to the surface, so you still look that exception up.""",
    ),
    (
        "Traffic pattern",
        """Desk note PT-1: This note names five legs of a standard rectangular traffic pattern: upwind, crosswind, downwind, base, and final.

Desk note PT-2: Upwind is the climb aligned with the runway after departure. Crosswind is the turn that takes you away from the runway heading. Downwind is parallel to the runway, opposite the landing direction. Base is the turn back toward the extended centerline. Final is the descent aligned with the runway.

Desk note PT-3: Pattern altitude is airport-specific. This sample does not assign a number. The study task is to find the altitude published for the airport you intend to use, then fly that altitude rather than a remembered default.""",
    ),
    (
        "Carburetor ice and mixture",
        """Desk note CI-1: This note treats carburetor ice as possible in humid air with a partly closed throttle, including when the outside air temperature is above freezing. The temperature drop inside the venturi can freeze moisture that is still liquid outside.

Desk note CI-2: The first sign this note wants you to remember is a gradual loss of engine power, sometimes with a rougher sound. The practice response in an airplane with a carburetor heat control is to apply carburetor heat as the handbook describes, then expect a further brief roughness as ice melts and passes through the engine.

Desk note CI-3: Mixture is a separate control. At higher density altitude the same fuel flow is too rich because the air is thinner. This note does not give a leaning procedure. Follow the powerplant section of the airplane's handbook.""",
    ),
]


def write_sample_pdf(path: Path) -> None:
    doc = pymupdf.open()
    try:
        for title, body in PAGES:
            page = doc.new_page(width=612, height=792)
            page.insert_textbox(
                pymupdf.Rect(54, 48, 558, 96),
                title,
                fontsize=18,
                fontname="hebo",
                color=(0.08, 0.12, 0.16),
            )
            page.insert_textbox(
                pymupdf.Rect(54, 110, 558, 740),
                body,
                fontsize=12,
                fontname="helv",
                color=(0.1, 0.12, 0.16),
                align=pymupdf.TEXT_ALIGN_LEFT,
            )
        path.parent.mkdir(parents=True, exist_ok=True)
        doc.save(path)
    finally:
        doc.close()
