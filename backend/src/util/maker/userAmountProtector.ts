import BigNumber from "bignumber.js";

interface PerformUserAmountLegalityType<UserAmountType = BigNumber> {
    (userData: UserAmountType, chain: PrePackagingChain): UserAmountType
}

// Precision already exists that requires special treatment
type PrecisionKeyType = "18" | "default";

interface PrePackagingChain { // temporary interface for the chain config
    precision: PrecisionKeyType;
    [key: string]: any;
}

type PrecisionResolverMapType = {
    [key in PrecisionKeyType]: PerformUserAmountLegalityType<string>
}

const precisionResolverMap: PrecisionResolverMapType = {
    // pay attention:  the type of field "userAmount" in the following methods is not BigNumber 
    // but string in decimal!!!
    "18": userAmount => userAmount.slice(0, 7),
    "default": userAmount => userAmount.slice(0, 3)
}

/**
 * @description {
 *  This method is to confirm the legitimacy of the amount
 *  if the amount u passed is legal, it will return it intact
 *  otherwise the data we processed will be returned
 * }
 * @param userAmount the amount user given
 * @param chain config of the current chain 
 */
export const performUserAmountLegality: PerformUserAmountLegalityType = (userAmount, chain) => {
    const { precision } = chain;
    const decimalData = userAmount.toFormat(); // convert BigNumber instance to decimal
    // if the precision that current chain support equals 18, the maximum precision of userAmount u passed is 6
    const matchResolver = precisionResolverMap[precision] || precisionResolverMap["default"];
    // eg: precision equals 18, but the value of userAmount is 0.3333333333
    // covert result after matchResolver processed was 0.333333
    const convertResult =  matchResolver(decimalData, chain); 
    return new BigNumber(convertResult);
}