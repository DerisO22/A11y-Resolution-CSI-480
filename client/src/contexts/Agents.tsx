import { createContext, useContext, useState } from "react";

import ollama from 'ollama';

type UserRole = 'user' | 'assitant';

type Message = {
    role: UserRole,
    content: string
}

interface LLMContentType {
    messages: Message[],
    sendMessage: (newMessage?: Message, modelType?: string) => Promise<void>,
}

const LLMContext = createContext<LLMContentType | undefined>(undefined);

interface LLMProviderProps {
    children: React.ReactNode,
}

export const LLMProvider = ({ children }: LLMProviderProps) => {
    const [ messages, setMessages ] = useState<Message[]>([]);

    const sendMessage = async(
        newMessage: Message = { role: 'user', content: 'hello ollama!' }, 
        modelType = 'llama3.2'
    ) => {
        const updatedMessages = [...messages, newMessage]
        setMessages(updatedMessages);

        try {
            const response = await ollama.chat({
                model: modelType,
                messages: updatedMessages
            });

            const aiResponseContent = response.message.content;
            const aiMessage: Message = { role: "assitant", content: aiResponseContent }

            setMessages(prev => [...prev, aiMessage]);
        } catch (err) {
            console.error("Error with ollama: ", err);
        }
    }

    return (
        <LLMContext.Provider 
            value={{
                messages,
                sendMessage
            }}
        >
            {children}
        </LLMContext.Provider>
    );
}

export const useLLM = () => {
    const context = useContext(LLMContext);

    if(context === undefined) {
        throw new Error("useLLM must be used within an LLMProvider");
    }

    return context;
}