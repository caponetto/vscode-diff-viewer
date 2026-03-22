declare module "@profoundlogic/hogan" {
  export interface Template {
    render(context: Context, partials?: Partials, indent?: string): string;
  }

  export interface Context {
    [key: string]: unknown;
  }

  export interface Partials {
    [key: string]: string | Template;
  }

  export function compile(template: string): Template;
}
