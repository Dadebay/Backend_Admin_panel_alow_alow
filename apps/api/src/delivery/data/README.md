# Delivery service boundary

`delivery-service-area.json` is the versioned backend service-area configuration:
Ahal (`TM-A`) plus Ashgabat (`TM-S`). It is independent of tariff polygons and
distance prices. An ordinary quote without coordinates previews prices only;
final personal checkout requires coordinates. Trusted phone-assisted orders
retain their existing text-only manual workflow.

The geometry was exported through Nominatim on 2026-10-07 from these
OpenStreetMap administrative relations:

- [Ahal, relation 223031](https://www.openstreetmap.org/relation/223031)
- [Ashgabat, relation 7328329](https://www.openstreetmap.org/relation/7328329)

Copyright OpenStreetMap contributors, licensed under
[ODbL 1.0](https://www.openstreetmap.org/copyright). The JSON retains complete
longitude/latitude rings and original precision; no simplification or bounding
rectangle defines eligibility. Ahal's inner ring excludes Ashgabat; the separate
Ashgabat polygon explicitly includes the city in the business service area.
Polygon arrays also support disconnected parts and additional holes.

The API imports this file at build time and requires no live geographic provider
for eligibility. Expansion requires a reviewed update of the bundled region
configuration and location regression tests, followed by the normal API release.
No new runtime environment variable, volume, migration, frontend release or
print-agent upgrade is required.
