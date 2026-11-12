"""
Extra candidate links from the two big hubs, LYNX Central (downtown) and the MCO Brightline station.

The nearest-neighbor candidate set never links downtown or the airport to the places people
want to go (Colonial, Universal, UCF, the Convention Center). These links are only candidates:
the planner still builds them only if they pay for themselves, and they are classified and
priced by the same rules as every other link.
"""

import math

KX = 111.32 * math.cos(math.radians(28.5))
KY = 110.57

LYNX = ("station:LYNX Central", (-81.380865, 28.548551))
MCO = ("station:Orlando", (-81.307619, 28.411698))     # the Brightline station at the airport

# (hub, center id, name, lon, lat)
TARGETS = [
    (LYNX, "center_8844a90f01fffff", "East Orlando (East Colonial Dr)", -81.2778, 28.5430),
    (LYNX, "center_8844a9159dfffff", "Universal Orlando Resort", -81.4736, 28.4817),
    (LYNX, "center_8844a90465fffff", "West Orlando (Colonial Dr)", -81.4267, 28.5533),
    (LYNX, "center_8844a90d21fffff", "UCF / Research Park", -81.2071, 28.6062),
    (MCO, "center_8844a91465fffff", "Convention Center / SeaWorld", -81.4685, 28.4121),
    (MCO, "center_8844a9159dfffff", "Universal Orlando Resort", -81.4736, 28.4817),
    (MCO, "center_8844a90f01fffff", "East Orlando (East Colonial Dr)", -81.2778, 28.5430),
    (MCO, "center_8844a91605fffff", "Walt Disney World (EPCOT / Disney Springs)", -81.5218, 28.3636),
]


def hub_connections():
    """Connections in the same tuple form as load_connections: (id, a_id, b_id, a_pt, b_pt, km)."""
    out = []
    for hub, cid, _name, lon, lat in TARGETS:
        out.append((f"{hub[0]}|{cid}", hub[0], cid, hub[1], (lon, lat), _km(hub[1], (lon, lat))))
    return out


def _km(a, b):
    return math.hypot((a[0] - b[0]) * KX, (a[1] - b[1]) * KY)


# ---- documented override: FDOT Sunshine Corridor Option 3A (SunRail to MCO) ----------------------
# Source: FDOT Sunshine Corridor TCAR Final Report (2024), Table 14 and Option 3A text, and the 2018
# SunRail Extension to OIA PD&E Study (cited in the TCAR): a 5.5-mile extension on the existing OUC spur
# track, built in existing right of way, from SunRail to the MCO terminal. Capital cost $400M includes
# construction, right of way and trainsets. Travel times in the TCAR (MCO from LYNX Central 28 min, from
# Kissimmee 21 min) put the junction near Meadow Woods; the TCAR does not name the junction, so that
# station choice is an assumption. Minutes: 28 - SunRail LYNX Central to Meadow Woods (19 min) = 9, and
# 21 - Kissimmee to Meadow Woods (10 min) = 11; the average is used.
SUNSHINE_3A = {"id": "sunshine_3a:Meadow Woods|Orlando", "a": "station:Meadow Woods", "b": "station:Orlando",
               "minutes": 10.0, "cost_musd": 400.0, "length_mi": 5.5}
