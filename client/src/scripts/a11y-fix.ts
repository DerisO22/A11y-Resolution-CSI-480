import { extractArgsFromCommand } from "./extractArgsFromCommand";


export const A11yFix = () => {
    const testOptions = extractArgsFromCommand();
    
    console.log("Options: \n", testOptions);
}

A11yFix();