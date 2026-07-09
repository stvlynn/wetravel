export class GeoError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "GeoError";
  }
}
