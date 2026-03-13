import chalk from 'chalk';

export class Logger {
  static info(message: string) {
    console.log(chalk.blue('ℹ'), message);
  }

  static success(message: string) {
    console.log(chalk.green('✓'), message);
  }

  static warning(message: string) {
    console.log(chalk.yellow('⚠'), message);
  }

  static error(message: string) {
    console.log(chalk.red('✗'), message);
  }

  static dim(message: string) {
    console.log(chalk.gray(message));
  }

  static bold(message: string) {
    console.log(chalk.bold(message));
  }

  static header(message: string) {
    console.log();
    console.log(chalk.bold.cyan(message));
    console.log(chalk.gray('─'.repeat(message.length)));
  }

  static step(step: number, total: number, message: string) {
    console.log(chalk.cyan(`[${step}/${total}]`), message);
  }

  static code(code: string) {
    console.log(chalk.bgGray.white(` ${code} `));
  }

  static list(items: string[]) {
    items.forEach(item => {
      console.log(chalk.gray('  •'), item);
    });
  }

  static divider() {
    console.log(chalk.gray('─'.repeat(50)));
  }
}