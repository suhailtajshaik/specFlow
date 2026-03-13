import ora from 'ora';
import type { Ora } from 'ora';

export class Spinner {
  private spinner: Ora;

  constructor(text: string) {
    this.spinner = ora(text);
  }

  start(): this {
    this.spinner.start();
    return this;
  }

  stop(): this {
    this.spinner.stop();
    return this;
  }

  succeed(text?: string): this {
    this.spinner.succeed(text);
    return this;
  }

  fail(text?: string): this {
    this.spinner.fail(text);
    return this;
  }

  warn(text?: string): this {
    this.spinner.warn(text);
    return this;
  }

  info(text?: string): this {
    this.spinner.info(text);
    return this;
  }

  updateText(text: string): this {
    this.spinner.text = text;
    return this;
  }

  static async withSpinner<T>(
    text: string, 
    task: (spinner: Spinner) => Promise<T>
  ): Promise<T> {
    const spinner = new Spinner(text).start();
    
    try {
      const result = await task(spinner);
      spinner.succeed();
      return result;
    } catch (error) {
      spinner.fail();
      throw error;
    }
  }
}

export function createSpinner(text: string): Spinner {
  return new Spinner(text);
}