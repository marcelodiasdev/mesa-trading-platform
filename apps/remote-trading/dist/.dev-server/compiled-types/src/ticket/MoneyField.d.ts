export interface MoneyFieldProps {
    readonly label: string;
    readonly value: string;
    readonly onChange: (masked: string) => void;
    readonly error?: string | undefined;
    readonly disabled?: boolean;
}
export declare function MoneyField({ label, value, onChange, error, disabled }: MoneyFieldProps): import("react").JSX.Element;
//# sourceMappingURL=MoneyField.d.ts.map