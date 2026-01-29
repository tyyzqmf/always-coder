declare module 'qrcode-terminal' {
  interface Options {
    small?: boolean;
  }

  function generate(text: string, opts?: Options, cb?: (qr: string) => void): void;
  function generate(text: string, cb?: (qr: string) => void): void;
  function setErrorLevel(level: 'L' | 'M' | 'Q' | 'H'): void;

  export { generate, setErrorLevel };
}
