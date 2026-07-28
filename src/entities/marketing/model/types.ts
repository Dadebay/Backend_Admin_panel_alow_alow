import type { components } from "@/app/lib/api-schema";

export type Banner = components["schemas"]["BannerResponseDto"];
export type Promo = components["schemas"]["PromoCodeResponseDto"];
export type CreateBanner = components["schemas"]["CreateBannerDto"];
export type UpdateBanner = components["schemas"]["UpdateBannerDto"];
export type CreatePromo = components["schemas"]["CreatePromoCodeDto"];
export type UpdatePromo = components["schemas"]["UpdatePromoCodeDto"];
