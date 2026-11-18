import { extractArgsFromCommand } from "./extractArgsFromCommand";


export const A11yFix = () => {
    const testOptions = extractArgsFromCommand();
    
    console.log("Chosen Run Options: \n", testOptions);
}

A11yFix();