import { ArrowLeftIcon } from "lucide-react";
import React from "react";
import { useLocation, useNavigate } from "react-router";
import AppHeader from "src/components/AppHeader";
import { FormattedBitcoinAmount } from "src/components/FormattedBitcoinAmount";
import FormattedFiatAmount from "src/components/FormattedFiatAmount";
import Loading from "src/components/Loading";
import { PaymentFailedAlert } from "src/components/PaymentFailedAlert";
import { PendingPaymentAlert } from "src/components/PendingPaymentAlert";
import { SpendingAlert } from "src/components/SpendingAlert";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { LinkButton } from "src/components/ui/custom/link-button";
import { LoadingButton } from "src/components/ui/custom/loading-button";
import { InputWithAdornment } from "src/components/ui/custom/input-with-adornment";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { useBalances } from "src/hooks/useBalances";
import PayFromSelect from "src/screens/wallet/send/PayFromSelect";
import { PayInvoiceResponse, PayOfferRequest } from "src/types";
import { request } from "src/utils/request";
import { toast } from "sonner";

export default function ConfirmOfferPayment() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { data: balances } = useBalances();

  const offer = state?.args?.offer as string | undefined;
  const [appId, setAppId] = React.useState<number>();
  const [amountSat, setAmountSat] = React.useState("");
  const [payerNote, setPayerNote] = React.useState("");
  const [isLoading, setLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState("");

  const confirmPayment = async () => {
    setErrorMessage("");
    try {
      if (!offer) {
        throw new Error("no offer set");
      }
      setLoading(true);
      const payload: PayOfferRequest = {
        offer,
        amountSat: +amountSat,
        payerNote,
        fromAppId: appId,
      };
      const payOfferResponse = await request<PayInvoiceResponse>(
        `/api/offers/pay`,
        {
          method: "POST",
          body: JSON.stringify(payload),
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      if (!payOfferResponse?.preimage) {
        throw new Error("No preimage in response");
      }

      navigate(`/wallet/send/success`, {
        state: {
          preimage: payOfferResponse.preimage,
          pageTitle: "Pay Lightning Offer",
          offer,
          amountSat: +amountSat,
          description: payerNote,
        },
      });
      toast("Successfully paid lightning offer");
    } catch (e) {
      console.error(e);
      setErrorMessage("" + e);
      toast.error("Failed to send payment", {
        description: "" + e,
      });
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (!offer) {
      navigate("/wallet/send");
    }
  }, [navigate, offer]);

  if (!balances || !offer) {
    return <Loading />;
  }

  return (
    <div className="grid gap-4">
      <AppHeader pageTitle="Pay Lightning Offer" title="Pay Lightning Offer" />
      <div className="max-w-lg grid gap-4">
        <PendingPaymentAlert />
        {errorMessage && (
          <PaymentFailedAlert errorMessage={errorMessage} invoice={offer} />
        )}
      </div>
      <div className="w-full md:max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle className="text-center">Confirm Payment</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 pt-2">
            <div className="grid gap-2">
              <Label htmlFor="offer">Offer</Label>
              <p id="offer" className="text-sm break-all text-muted-foreground">
                {offer}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="amount">Amount</Label>
              <InputWithAdornment
                id="amount"
                type="number"
                value={amountSat}
                placeholder="Amount in sats"
                onChange={(e) => {
                  setAmountSat(e.target.value.trim());
                }}
                min={1}
                max={balances.lightning.totalSpendableSat}
                required
                autoFocus
                endAdornment={
                  <FormattedFiatAmount
                    amountSat={Number(amountSat)}
                    className="mr-2"
                  />
                }
              />
              <div className="flex justify-between text-xs text-muted-foreground sensitive slashed-zero">
                <div>
                  Spending Balance:{" "}
                  <FormattedBitcoinAmount
                    amountMsat={balances.lightning.totalSpendableMsat}
                  />
                </div>
                <FormattedFiatAmount
                  className="text-xs"
                  amountSat={balances.lightning.totalSpendableSat}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="payerNote">Message</Label>
              <Input
                id="payerNote"
                value={payerNote}
                placeholder="Optional message"
                onChange={(e) => {
                  setPayerNote(e.target.value);
                }}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-2 pt-2">
            <PayFromSelect appId={appId} onChange={setAppId} />
            <SpendingAlert className="mb-2" amountSat={+amountSat} />
            <LoadingButton
              onClick={confirmPayment}
              loading={isLoading}
              type="submit"
              className="w-full"
              disabled={!amountSat || +amountSat <= 0}
            >
              Confirm Payment
            </LoadingButton>
            <LinkButton to="/wallet/send" variant="link" className="w-full">
              <ArrowLeftIcon className="w-4 h-4 mr-2" />
              Back
            </LinkButton>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
