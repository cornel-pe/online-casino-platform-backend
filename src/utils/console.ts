class Console {
    static success(...args: any[]) {
      console.log("\x1b[32m✔", ...args, "\x1b[0m");
    }
  
    static info(...args: any[]) {
      console.log("\x1b[34mℹ", ...args, "\x1b[0m");
    }
  
    static warn(...args: any[]) {
      console.log("\x1b[33m⚠", ...args, "\x1b[0m");
    }
  
    static error(...args: any[]) {
      console.log("\x1b[31m✖", ...args, "\x1b[0m");
    }
  }
export default Console;