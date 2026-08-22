import type { components } from "@alowalow/api-contract";

export type Category = components["schemas"]["CatalogAdminCategoryResponseDto"];
export type Product = components["schemas"]["CatalogAdminProductResponseDto"];
export type ReceiptPrintSettings =
  components["schemas"]["ReceiptPrintSettingsResponseDto"];
export type CreateCategory = components["schemas"]["CreateCategoryDto"];
export type UpdateCategory = components["schemas"]["UpdateCategoryDto"];
export type CreateProduct = components["schemas"]["CreateProductDto"];
export type UpdateProduct = components["schemas"]["UpdateProductDto"];
export type UpdateReceiptPrintSettings =
  components["schemas"]["UpdateReceiptPrintSettingsDto"];
export type MediaUpload = components["schemas"]["MediaUploadResponseDto"];
