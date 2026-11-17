import { createContext } from "react";

interface AgentsContext {

};

const AgentContext = createContext<AgentsContext | undefined>(undefined);

type AgentsProviderProps = {
    children?: React.ReactNode,
};

export const AgentsProvider = ({ children }: AgentsProviderProps) => {
    

    return (
        <AgentContext.Provider value={{}}>
            {children}
        </AgentContext.Provider>
    )
}
